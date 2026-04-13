from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse, urlunparse

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db
from schemas import PortfolioExcludeRequest, PortfolioItemResponse, PortfolioSummaryResponse


router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def _extract_parts_from_row_data(row_data: Any) -> list[str]:
    """
    Convert stored `row_data` into a list of part numbers.

    `row_data` comes from the uploaded sheet row. In this app, the first column
    (index 0) is *often* the "search parts" column; other columns may contain
    prices, quantities, vendors, etc. However, some sheets may place part
    numbers in other columns, so we iterate every cell and extract parts
    from each.
    """
    if not isinstance(row_data, list) or not row_data:
        return []

    parts: list[str] = []

    def add_part(s: str) -> None:
        cleaned = s.strip()
        if not cleaned:
            return
        # If a single cell contains multiple parts, split common separators.
        # Keep this conservative to avoid breaking valid part numbers.
        if "," in cleaned:
            for chunk in cleaned.split(","):
                add_part(chunk)
            return
        if ";" in cleaned:
            for chunk in cleaned.split(";"):
                add_part(chunk)
            return
        if "|" in cleaned:
            for chunk in cleaned.split("|"):
                add_part(chunk)
            return

        if cleaned not in parts:
            parts.append(cleaned)

    # Only extract from the first column (search parts).
    for cell in row_data:
        if cell is None:
            continue
        # Some imports store a cell as a list of values.
        if isinstance(cell, list):
            for inner in cell:
                if inner is None:
                    continue
                add_part(str(inner))
        else:
            add_part(cell if isinstance(cell, str) else str(cell))

    return parts


def _normalize_key(key: str) -> str:
    # Convert camelCase -> snake_case, then normalize separators and whitespace.
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key).strip().lower()
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s


def _extract_first_string(d: dict[str, Any], key_predicate) -> Optional[str]:
    for k, v in d.items():
        norm = _normalize_key(str(k))
        if not key_predicate(norm):
            continue
        if v is None:
            continue
        if isinstance(v, (str, int, float, bool)):
            s = str(v).strip()
            return s or None
    return None


def _coerce_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v.is_integer():
            return int(v)
        return None
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        m = re.search(r"-?\d+", s)
        return int(m.group(0)) if m else None
    return None


def _extract_quantity(extracted: dict[str, Any]) -> Optional[int]:
    def is_qty(norm: str) -> bool:
        return (
            norm == "quantity"
            or norm == "qty"
            or norm.endswith("_quantity")
            or norm.endswith("_qty")
            or norm.endswith("amount")
            or norm.endswith("count")
        )

    # Try top-level first.
    q = _extract_first_string(extracted, is_qty)
    if q is not None:
        return _coerce_int(q)

    # Then try nested dicts (one level) if present.
    for v in extracted.values():
        if isinstance(v, dict):
            q2 = _extract_first_string(v, is_qty)
            if q2 is not None:
                return _coerce_int(q2)
    return None


def _extract_part_number(extracted: dict[str, Any]) -> Optional[str]:
    def is_part_number(norm: str) -> bool:
        if norm in {"partno", "part_number", "part_no"}:
            return True
        return "part" in norm and ("number" in norm or norm.endswith("part_no"))

    # Try top-level first.
    part = _extract_first_string(extracted, is_part_number)
    if part is not None:
        return part

    # Then try nested dicts (one level).
    for v in extracted.values():
        if isinstance(v, dict):
            part2 = _extract_first_string(v, is_part_number)
            if part2 is not None:
                return part2
    return None


def _extract_vendor_name(extracted: dict[str, Any]) -> Optional[str]:
    def is_vendor_name(norm: str) -> bool:
        if norm in {"vendor_name", "vendorname"}:
            return True
        # Looser matching for common variants.
        return (("vendor" in norm) or ("supplier" in norm) or ("manufacturer" in norm)) and (
            "name" in norm or norm.endswith("vendor")
        )

    vendor = _extract_first_string(extracted, is_vendor_name)
    if vendor is not None:
        return vendor

    for v in extracted.values():
        if isinstance(v, dict):
            vendor2 = _extract_first_string(v, is_vendor_name)
            if vendor2 is not None:
                return vendor2
    return None


def _extract_price(extracted: dict[str, Any]) -> Optional[str]:
    def is_price(norm: str) -> bool:
        if norm in {"price"}:
            return True
        return "price" in norm or norm.endswith("amount") or norm.endswith("cost")

    price = _extract_first_string(extracted, is_price)
    if price is not None:
        return price

    for v in extracted.values():
        if isinstance(v, dict):
            price2 = _extract_first_string(v, is_price)
            if price2 is not None:
                return price2
    return None


def _parse_price_numeric(price: Optional[str]) -> Optional[float]:
    """
    Best-effort parse of a price string to a float (digits, optional minus, one dot).
    Returns None if nothing numeric can be interpreted.
    """
    if price is None:
        return None
    s = str(price).strip()
    if not s:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", s)
    if not cleaned or cleaned in ("-", ".", "-.", ".."):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _sanitize_portfolio_price(price: Optional[str]) -> Optional[str]:
    """
    Scraping often yields $0 or negative values by mistake. Those are not valid
    offer prices — clear them so clients pick the next best positive price.
    Non-numeric strings (e.g. 'Contact') are kept as-is.
    """
    if price is None:
        return None
    n = _parse_price_numeric(price)
    if n is None:
        return price
    if n <= 0:
        return None
    return price


def _sanitize_item_price(price: Any) -> Optional[str]:
    """API response uses optional string price; drop invalid numeric scrape values."""
    if price is None:
        return None
    if isinstance(price, bool):
        return None
    if isinstance(price, (int, float)):
        if isinstance(price, float) and (price != price or price in (float("inf"), float("-inf"))):
            return None
        n = float(price)
        if n <= 0:
            return None
        if n == int(n):
            return str(int(n))
        return str(n)
    if isinstance(price, str):
        return _sanitize_portfolio_price(price.strip() or None)
    return _sanitize_portfolio_price(str(price).strip() or None)


def _is_safe_http_url(s: str) -> bool:
    t = s.strip()
    if len(t) > 2048:
        return False
    low = t.lower()
    return low.startswith("http://") or low.startswith("https://")


def _coerce_image_url_value(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, str):
        st = v.strip()
        return st if st and _is_safe_http_url(st) else None
    if isinstance(v, list):
        for el in v:
            u = _coerce_image_url_value(el)
            if u:
                return u
    return None


def _extract_product_image_url(extracted: dict[str, Any]) -> Optional[str]:
    """Best-effort image URL from scraped/cleaned JSON (e.g. product_image from Groq)."""

    def is_image_key(norm: str) -> bool:
        if norm in {
            "product_image",
            "image_url",
            "thumbnail_url",
            "photo_url",
            "main_image",
            "product_photo",
        }:
            return True
        if norm == "image" or norm.endswith("_image"):
            return True
        return ("thumbnail" in norm or "photo" in norm) and "url" in norm

    for k, v in extracted.items():
        norm = _normalize_key(str(k))
        if not is_image_key(norm):
            continue
        u = _coerce_image_url_value(v)
        if u:
            return u

    for v in extracted.values():
        if isinstance(v, dict):
            u = _extract_product_image_url(v)
            if u:
                return u
    return None


def _extract_portfolio_items_from_extracted(extracted: Any) -> list[dict[str, Any]]:
    """
    Firecrawl/Groq extracted data can be shaped differently (single dict vs list of dicts).
    This normalizes it into our `PortfolioItemResponse` fields.
    """
    items: list[dict[str, Any]] = []

    def to_item(d: dict[str, Any]) -> dict[str, Any]:
        part_number = _extract_part_number(d)
        vendor_name = _extract_vendor_name(d)
        price = _extract_price(d)
        quantity = _extract_quantity(d)
        image_url = _extract_product_image_url(d)
        return {
            "part_number": part_number,
            "vendor_name": vendor_name,
            "price": price,
            "quantity": quantity,
            "image_url": image_url,
        }

    if isinstance(extracted, list):
        for el in extracted:
            if isinstance(el, dict):
                item = to_item(el)
                if any(item.values()):
                    items.append(item)
        return items

    if not isinstance(extracted, dict):
        return items

    # If the extracted payload includes a list of product-like dicts, use it.
    list_candidates: list[list[Any]] = []
    for v in extracted.values():
        if isinstance(v, list) and v and all(isinstance(x, dict) for x in v):
            list_candidates.append(v)

    if list_candidates:
        for arr in list_candidates:
            for el in arr:
                item = to_item(el)
                if any(item.values()):
                    items.append(item)
        return items

    item = to_item(extracted)
    if any(item.values()):
        return [item]
    return []


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    auth = request.headers.get("Authorization")
    if not auth or not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == int(payload["sub"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _aggregate_summary_from_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    """
    unique_parts: distinct non-empty part_number (case-insensitive).
    offer_count: number of portfolio rows after merge.
    best_price / average_price: over positive numeric prices only (sanitized upstream).
    """
    parts: set[str] = set()
    nums: list[float] = []
    for it in items:
        pn = it.get("part_number")
        if pn is not None and str(pn).strip():
            parts.add(str(pn).strip().upper())
        raw = it.get("price")
        if raw is None:
            continue
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)):
            n = float(raw)
        else:
            n = _parse_price_numeric(str(raw))
        if n is not None and n > 0:
            nums.append(n)
    return {
        "unique_parts": len(parts),
        "offer_count": len(items),
        "best_price": min(nums) if nums else None,
        "average_price": (sum(nums) / len(nums)) if nums else None,
        "prices_included": len(nums),
    }


async def _load_deduped_portfolio_items_for_selection(
    mongo_db: AsyncIOMotorDatabase,
    owner_id: int,
    selection_id: int,
) -> list[dict[str, Any]]:
    # 1) Find research URLs for this selection.
    #    We also load `row_data` so we can extract `part_number` values from
    #    the entire row (some sheets may place part numbers in different columns).
    research_urls_cursor = mongo_db["research_urls"].find(
        {"owner_id": owner_id, "selection_id": selection_id},
        {"id": 1, "row_data": 1, "row_index": 1},
    )
    research_url_ids: list[int] = []
    parts_by_research_url_id: dict[int, list[str]] = {}
    rid_to_row_index: dict[int, int] = {}
    async for doc in research_urls_cursor:
        if "id" in doc:
            rid = int(doc["id"])
            research_url_ids.append(rid)
            row_data = doc.get("row_data")
            parts_by_research_url_id[rid] = _extract_parts_from_row_data(row_data)
            ri = doc.get("row_index")
            if ri is not None:
                rid_to_row_index[rid] = int(ri)

    if not research_url_ids:
        return []

    # 2) Fetch scraped structured data for those URLs.
    scraped_by_rid: dict[int, list[dict[str, Any]]] = {}
    scraped_cursor = mongo_db["research_scraped_data"].find(
        {"owner_id": owner_id, "research_url_id": {"$in": research_url_ids}},
        {"data": 1, "research_url_id": 1, "url": 1},
    )

    items: list[dict[str, Any]] = []
    async for scraped_doc in scraped_cursor:
        rid = scraped_doc.get("research_url_id")
        if rid is None:
            continue
        rid_int = int(rid)
        scraped_by_rid.setdefault(rid_int, []).append(scraped_doc)

    # Important:
    # Only iterating over `research_scraped_data` means we show parts only for rows that were scraped successfully.
    # Iterate over all `research_urls` for this selection so the UI can list *all* parts from `row_data`
    # even when scraping/extraction is missing for some rows.
    for rid_int in research_url_ids:
        rj = rid_to_row_index.get(rid_int)
        forced_parts = parts_by_research_url_id.get(rid_int, [])
        scraped_docs_for_rid = scraped_by_rid.get(rid_int, [])

        # If scraping/extraction didn't happen for this row, still emit part placeholders.
        if not scraped_docs_for_rid:
            for p in forced_parts:
                items.append(
                    {
                        "part_number": p,
                        "vendor_name": None,
                        "price": None,
                        "quantity": None,
                        "url": None,
                        "image_url": None,
                        "row_index": rj,
                    },
                )
            continue

        for scraped_doc in scraped_docs_for_rid:
            url_items: list[dict[str, Any]] = []
            extracted = scraped_doc.get("data")
            source_url: Optional[str] = scraped_doc.get("url") or None

            def _with_url(d: dict[str, Any]) -> dict[str, Any]:
                return {**d, "url": source_url}

            extracted_items = _extract_portfolio_items_from_extracted(extracted)

            # If extraction produced nothing, still return at least the parts from the sheet.
            if not extracted_items:
                if forced_parts:
                    for p in forced_parts:
                        url_items.append(
                            {
                                "part_number": p,
                                "vendor_name": None,
                                "price": None,
                                "quantity": None,
                                "url": source_url,
                                "image_url": None,
                            },
                        )
                items.extend({**x, "row_index": rj} for x in url_items)
                continue

            # Best-effort association of extracted items to the "search parts" from the sheet row.
            #
            # Previously we overwrote `part_number` for every extracted item with *all* forced_parts,
            # which could inject unrelated parts into the response when a sheet row contains
            # multiple parts. Instead:
            # - If extraction already produced a `part_number`, keep it (optionally filter to forced parts).
            # - If extraction is missing `part_number`, duplicate across forced parts.
            if forced_parts:
                forced_parts_normalized = {str(p).strip().upper() for p in forced_parts if str(p).strip()}

                extracted_has_part_numbers = any(
                    (base.get("part_number") is not None) and str(base.get("part_number")).strip()
                    for base in extracted_items
                )

                if extracted_has_part_numbers:
                    matched: list[dict[str, Any]] = []
                    for base in extracted_items:
                        pn = base.get("part_number")
                        if pn is None:
                            continue
                        pn_norm = str(pn).strip().upper()
                        if pn_norm in forced_parts_normalized:
                            matched.append(_with_url(base))

                    if matched:
                        url_items.extend(matched)
                        for base in extracted_items:
                            pn = base.get("part_number")
                            if pn is not None and str(pn).strip():
                                continue
                            for p in forced_parts:
                                url_items.append(
                                    {
                                        "part_number": p,
                                        "vendor_name": base.get("vendor_name"),
                                        "price": base.get("price"),
                                        "quantity": base.get("quantity"),
                                        "url": source_url,
                                        "image_url": base.get("image_url"),
                                    }
                                )
                    else:
                        for base in extracted_items:
                            pn = base.get("part_number")
                            if pn is not None and str(pn).strip():
                                url_items.append(_with_url(base))
                            else:
                                for p in forced_parts:
                                    url_items.append(
                                        {
                                            "part_number": p,
                                            "vendor_name": base.get("vendor_name"),
                                            "price": base.get("price"),
                                            "quantity": base.get("quantity"),
                                            "url": source_url,
                                            "image_url": base.get("image_url"),
                                        }
                                    )
                else:
                    # Extraction didn't provide any part numbers: duplicate across forced parts.
                    for base in extracted_items:
                        for p in forced_parts:
                            url_items.append(
                                {
                                    "part_number": p,
                                    "vendor_name": base.get("vendor_name"),
                                    "price": base.get("price"),
                                    "quantity": base.get("quantity"),
                                    "url": source_url,
                                    "image_url": base.get("image_url"),
                                }
                            )
            else:
                url_items.extend([_with_url(base) for base in extracted_items])

            # Ensure every part found in the sheet row is represented.
            if forced_parts:
                existing_parts_normalized = {
                    str(it.get("part_number")).strip().upper()
                    for it in url_items
                    if it.get("part_number") is not None and str(it.get("part_number")).strip()
                }
                for p in forced_parts:
                    p_str = str(p).strip()
                    if not p_str:
                        continue
                    p_norm = p_str.upper()
                    if p_norm not in existing_parts_normalized:
                        url_items.append(
                            {
                                "part_number": p_str,
                                "vendor_name": None,
                                "price": None,
                                "quantity": None,
                                "url": source_url,
                                "image_url": None,
                            }
                        )

            items.extend({**x, "row_index": rj} for x in url_items)

    # 2b) Drop bogus scraped prices (0 or negative); keep row but clear price so UI skips them for "best".
    items = [{**it, "price": _sanitize_item_price(it.get("price"))} for it in items]

    # 3) De-dupe. Include url in the key so same part from different sources both appear.
    deduped: list[dict[str, Any]] = []
    seen: set[
        tuple[
            Optional[str],
            Optional[str],
            Optional[str],
            Optional[int],
            Optional[str],
            Optional[str],
        ]
    ] = set()
    for it in items:
        key = (
            it.get("part_number"),
            it.get("vendor_name"),
            it.get("price"),
            it.get("quantity"),
            it.get("url"),
            it.get("image_url"),
            it.get("row_index"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(it)

    return deduped[:500]


async def _merge_portfolio_items_all_selections(
    mongo_db: AsyncIOMotorDatabase,
    owner_id: int,
) -> list[dict[str, Any]]:
    """Same merge as portfolio summary: one combined list across all saved datasheet selections."""
    sel_cursor = mongo_db["data_sheet_selections"].find({"owner_id": owner_id}, {"id": 1})
    selection_ids: list[int] = []
    async for doc in sel_cursor:
        if "id" in doc:
            selection_ids.append(int(doc["id"]))

    if not selection_ids:
        return []

    merged: list[dict[str, Any]] = []
    seen_merge: set[tuple[Any, ...]] = set()
    for sid in selection_ids:
        batch = await _load_deduped_portfolio_items_for_selection(mongo_db, owner_id, sid)
        for it in batch:
            key = (
                it.get("part_number"),
                it.get("vendor_name"),
                it.get("price"),
                it.get("quantity"),
            )
            if key in seen_merge:
                continue
            seen_merge.add(key)
            merged.append(it)

    return merged[:500]


def _norm_part_key(p: Any) -> str:
    return (p or "").strip().upper()


def _norm_vendor_key(v: Any) -> str:
    return (v or "").strip().upper()


def _norm_url_key(u: Any) -> str:
    if u is None:
        return ""
    s = str(u).strip()
    if not s:
        return ""
    try:
        p = urlparse(s)
        netloc = (p.netloc or "").lower()
        path = (p.path or "").rstrip("/") or "/"
        return urlunparse((p.scheme.lower(), netloc, path, "", p.query, ""))
    except Exception:
        return s.lower()


def _offer_exclusion_matches(item: dict[str, Any], ex: dict[str, Any]) -> bool:
    """Every field present on the exclusion must match the portfolio row."""
    if _norm_part_key(item.get("part_number")) != _norm_part_key(ex.get("part_number")):
        return False
    if ex.get("exclude_entire_part"):
        return True
    if "vendor_name" in ex:
        if _norm_vendor_key(item.get("vendor_name")) != _norm_vendor_key(ex.get("vendor_name")):
            return False
    if "url" in ex:
        if _norm_url_key(item.get("url")) != _norm_url_key(ex.get("url")):
            return False
    if "price" in ex:
        if str(item.get("price") or "") != str(ex.get("price") or ""):
            return False
    if "quantity" in ex and ex.get("quantity") is not None:
        if item.get("quantity") != ex.get("quantity"):
            return False
    return True


async def _load_exclusions(
    mongo_db: AsyncIOMotorDatabase,
    owner_id: int,
) -> list[dict[str, Any]]:
    cursor = mongo_db["portfolio_exclusions"].find({"owner_id": owner_id})
    exclusions: list[dict[str, Any]] = []
    async for doc in cursor:
        ex: dict[str, Any] = {
            "part_number": doc.get("part_number"),
            "exclude_entire_part": bool(doc.get("exclude_entire_part")),
        }
        if "vendor_name" in doc:
            ex["vendor_name"] = doc.get("vendor_name")
        if "url" in doc:
            ex["url"] = doc.get("url")
        if "price" in doc:
            ex["price"] = doc.get("price")
        if "quantity" in doc:
            ex["quantity"] = doc.get("quantity")
        exclusions.append(ex)
    return exclusions


def _apply_exclusions(
    items: list[dict[str, Any]],
    exclusions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not exclusions:
        return items
    result: list[dict[str, Any]] = []
    for item in items:
        item_pn = _norm_part_key(item.get("part_number"))
        excluded = False
        for ex in exclusions:
            if _norm_part_key(ex.get("part_number")) != item_pn:
                continue
            if ex.get("exclude_entire_part"):
                excluded = True
                break
            has_offer_keys = any(
                k in ex for k in ("vendor_name", "url", "price", "quantity")
            )
            if not has_offer_keys:
                excluded = True
                break
            if _offer_exclusion_matches(item, ex):
                excluded = True
                break
        if not excluded:
            result.append(item)
    return result


@router.get("/items", response_model=list[PortfolioItemResponse])
async def list_portfolio_items(
    selection_id: int | None = None,
    row_index: int | None = None,
    user: User = Depends(get_current_user),
    mongo_db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    if selection_id is None:
        deduped = await _merge_portfolio_items_all_selections(mongo_db, user.id)
    else:
        deduped = await _load_deduped_portfolio_items_for_selection(mongo_db, user.id, selection_id)
    if row_index is not None:
        deduped = [it for it in deduped if it.get("row_index") == row_index]
    exclusions = await _load_exclusions(mongo_db, user.id)
    deduped = _apply_exclusions(deduped, exclusions)
    return [PortfolioItemResponse(**it) for it in deduped]


@router.get("/summary", response_model=PortfolioSummaryResponse)
async def get_portfolio_summary(
    user: User = Depends(get_current_user),
    mongo_db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    merged = await _merge_portfolio_items_all_selections(mongo_db, user.id)
    exclusions = await _load_exclusions(mongo_db, user.id)
    merged = _apply_exclusions(merged, exclusions)
    if not merged:
        return PortfolioSummaryResponse()
    return PortfolioSummaryResponse(**_aggregate_summary_from_items(merged))


def _portfolio_exclusion_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _has_offer_discriminator(body: PortfolioExcludeRequest) -> bool:
    if body.vendor_name is not None and str(body.vendor_name).strip():
        return True
    if body.url is not None and str(body.url).strip():
        return True
    if body.price is not None and str(body.price).strip():
        return True
    if body.quantity is not None:
        return True
    return False


def _build_offer_exclusion_doc(
    user_id: int,
    body: PortfolioExcludeRequest,
    *,
    part_number: str,
    excluded_at: str,
) -> dict[str, Any]:
    doc: dict[str, Any] = {
        "owner_id": user_id,
        "part_number": part_number,
        "exclude_entire_part": False,
        "excluded_at": excluded_at,
    }
    data = body.model_dump(exclude_unset=True)
    for k in ("vendor_name", "url", "price", "quantity"):
        if k in data:
            doc[k] = data[k]
    return doc


def _offer_exclusion_filter(user_id: int, doc: dict[str, Any]) -> dict[str, Any]:
    flt: dict[str, Any] = {
        "owner_id": user_id,
        "part_number": doc["part_number"],
        "exclude_entire_part": False,
    }
    for k in ("vendor_name", "url", "price", "quantity"):
        if k in doc:
            flt[k] = doc[k]
    return flt


@router.post("/items/exclude")
async def exclude_portfolio_item(
    body: PortfolioExcludeRequest,
    user: User = Depends(get_current_user),
    mongo_db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    pn = (body.part_number or "").strip()
    if not pn:
        raise HTTPException(status_code=400, detail="part_number is required")
    now = _portfolio_exclusion_now()
    if body.exclude_entire_part:
        await mongo_db["portfolio_exclusions"].delete_many(
            {"owner_id": user.id, "part_number": pn},
        )
        await mongo_db["portfolio_exclusions"].insert_one(
            {
                "owner_id": user.id,
                "part_number": pn,
                "exclude_entire_part": True,
                "excluded_at": now,
            },
        )
        return {"status": "excluded", "part_number": pn, "scope": "part"}
    if not _has_offer_discriminator(body):
        raise HTTPException(
            status_code=400,
            detail="To remove a single vendor offer, send vendor_name, url, price, and/or quantity.",
        )
    doc = _build_offer_exclusion_doc(user.id, body, part_number=pn, excluded_at=now)
    flt = _offer_exclusion_filter(user.id, doc)
    await mongo_db["portfolio_exclusions"].delete_many(flt)
    await mongo_db["portfolio_exclusions"].insert_one(doc)
    return {"status": "excluded", "part_number": pn, "scope": "offer"}


@router.post("/items/restore")
async def restore_portfolio_item(
    body: PortfolioExcludeRequest,
    user: User = Depends(get_current_user),
    mongo_db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    pn = (body.part_number or "").strip()
    if not pn:
        raise HTTPException(status_code=400, detail="part_number is required")
    if body.exclude_entire_part:
        result = await mongo_db["portfolio_exclusions"].delete_many(
            {"owner_id": user.id, "part_number": pn, "exclude_entire_part": True},
        )
        return {"status": "restored", "deleted_count": result.deleted_count}
    if not _has_offer_discriminator(body):
        raise HTTPException(
            status_code=400,
            detail="To restore a single vendor offer, send vendor_name, url, price, and/or quantity.",
        )
    now = _portfolio_exclusion_now()
    doc = _build_offer_exclusion_doc(user.id, body, part_number=pn, excluded_at=now)
    flt = _offer_exclusion_filter(user.id, doc)
    result = await mongo_db["portfolio_exclusions"].delete_many(flt)
    return {"status": "restored", "deleted_count": result.deleted_count}
