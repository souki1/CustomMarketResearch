from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db
from schemas import PortfolioItemResponse


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
        return {
            "part_number": part_number,
            "vendor_name": vendor_name,
            "price": price,
            "quantity": quantity,
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


@router.get("/items", response_model=list[PortfolioItemResponse])
async def list_portfolio_items(
    selection_id: int,
    user: User = Depends(get_current_user),
    mongo_db: AsyncIOMotorDatabase = Depends(get_mongo_db),
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    # 1) Find research URLs for this selection.
    #    We also load `row_data` so we can extract `part_number` values from
    #    the entire row (some sheets may place part numbers in different columns).
    research_urls_cursor = mongo_db["research_urls"].find(
        {"owner_id": user.id, "selection_id": selection_id},
        {"id": 1, "row_data": 1},
    )
    research_url_ids: list[int] = []
    parts_by_research_url_id: dict[int, list[str]] = {}
    async for doc in research_urls_cursor:
        if "id" in doc:
            rid = int(doc["id"])
            research_url_ids.append(rid)
            row_data = doc.get("row_data")
            parts_by_research_url_id[rid] = _extract_parts_from_row_data(row_data)

    if not research_url_ids:
        return []

    # 2) Fetch scraped structured data for those URLs.
    scraped_by_rid: dict[int, list[dict[str, Any]]] = {}
    scraped_cursor = mongo_db["research_scraped_data"].find(
        {"owner_id": user.id, "research_url_id": {"$in": research_url_ids}},
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
                            },
                        )
                items.extend(url_items)
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
                            }
                        )

            items.extend(url_items)

    # 3) De-dupe. Include url in the key so same part from different sources both appear.
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[Optional[str], Optional[str], Optional[str], Optional[int], Optional[str]]] = set()
    for it in items:
        key = (it.get("part_number"), it.get("vendor_name"), it.get("price"), it.get("quantity"), it.get("url"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(it)

    # Ensure response matches schema fields (Pydantic will handle casting).
    return [PortfolioItemResponse(**it) for it in deduped[:500]]
