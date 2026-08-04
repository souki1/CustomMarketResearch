import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from config import get_settings
from database import get_db
from models import User
from mongo import get_mongo_db, get_next_sequence
from schemas import (
    DataSheetSelectionCreate,
    DataSheetSelectionResponse,
    ResearchMoreSourceBody,
    ResearchMoreSourceResponse,
    ResearchSearchBody,
    ResearchSearchResponse,
    ResearchTransferRequest,
    ResearchTransferResponse,
)
from data.groq_client import clean_structured_data
from data.firecrawl_client import scrape_url_with_ai_extraction
from data.serper_client import extract_organic_results_from_serper_response, search_serper


router = APIRouter(prefix="/datasheet", tags=["datasheet"])


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
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


@router.post("/selections", response_model=DataSheetSelectionResponse, status_code=201)
async def save_selection(
    payload: DataSheetSelectionCreate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    if not payload.headers:
        raise HTTPException(status_code=400, detail="At least one header is required")
    if len(payload.rows) > 0 and any(len(row) != len(payload.headers) for row in payload.rows):
        raise HTTPException(
            status_code=400,
            detail="Each row must have the same number of values as headers",
        )
    if payload.row_indices is not None and len(payload.row_indices) != len(payload.rows):
        raise HTTPException(
            status_code=400,
            detail="row_indices length must match rows length",
        )

    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, "data_sheet_selections")
    doc = {
        "id": new_id,
        "owner_id": user.id,
        "headers": payload.headers,
        "rows": payload.rows,
        "row_indices": payload.row_indices or list(range(len(payload.rows))),
        "sheet_name": payload.sheet_name,
        "file_id": payload.file_id,
        "tab_id": payload.tab_id,
        "created_at": now,
    }
    await mongo_db["data_sheet_selections"].insert_one(doc)

    return DataSheetSelectionResponse(
        id=new_id,
        headers=doc["headers"],
        rows=doc["rows"],
        sheet_name=doc["sheet_name"],
        file_id=doc["file_id"],
        tab_id=doc["tab_id"],
        created_at=now,
    )


@router.get("/selections/debug")
async def debug_selections(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    """Debug: verify what the backend sees in MongoDB (requires auth)."""
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    count = await mongo_db["data_sheet_selections"].count_documents({})
    count_owner = await mongo_db["data_sheet_selections"].count_documents({"owner_id": user.id})
    counter = await mongo_db["counters"].find_one({"_id": "data_sheet_selections"})
    return {
        "database_name": mongo_db.name,
        "total_documents": count,
        "your_documents": count_owner,
        "counter_seq": counter.get("seq") if counter else None,
    }


@router.get("/selections/debug-public")
async def debug_selections_public(
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    """Debug: MongoDB stats without auth (remove in production)."""
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    count = await mongo_db["data_sheet_selections"].count_documents({})
    counter = await mongo_db["counters"].find_one({"_id": "data_sheet_selections"})
    return {
        "database_name": mongo_db.name,
        "total_documents": count,
        "counter_seq": counter.get("seq") if counter else None,
    }


@router.get("/selections", response_model=list[DataSheetSelectionResponse])
async def list_selections(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    cursor = mongo_db["data_sheet_selections"].find({"owner_id": user.id}).sort(
        "created_at", -1
    )
    docs = await cursor.to_list(length=100)
    return [
        DataSheetSelectionResponse(
            id=d["id"],
            headers=d["headers"],
            rows=d["rows"],
            sheet_name=d.get("sheet_name"),
            file_id=d.get("file_id"),
            tab_id=d.get("tab_id"),
            created_at=d["created_at"],
        )
        for d in docs
    ]


@router.post("/selections/{selection_id}/search", response_model=ResearchSearchResponse)
async def search_selection_and_store_urls(
    selection_id: int,
    body: ResearchSearchBody = Body(default_factory=lambda: ResearchSearchBody()),
    user: Annotated[User, Depends(get_current_user)] = ...,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = ...,
):
    """
    For each row in the selection, search via Serper.dev using column values
    and store the URLs in the research_urls collection.
    """
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    settings = get_settings()
    if not settings.serper_api_key:
        raise HTTPException(
            status_code=500,
            detail="SERPER_API_KEY is not configured. Add it to .env.development",
        )

    selection = await mongo_db["data_sheet_selections"].find_one(
        {"id": selection_id, "owner_id": user.id}
    )
    if not selection:
        raise HTTPException(status_code=404, detail="Selection not found")

    headers = selection.get("headers") or []
    rows = selection.get("rows") or []
    row_indices = selection.get("row_indices") or list(range(len(rows)))

    if not rows:
        raise HTTPException(status_code=400, detail="Selection has no rows to search")

    research_url_ids: list[int] = []
    total_urls = 0
    job_id: int | None = None
    completed_rows = 0

    try:
        # Mark any prior running jobs for this sheet as superseded so other browsers
        # don't keep showing an abandoned run.
        supersede_query: dict = {"owner_id": user.id, "status": "running"}
        if selection.get("file_id") is not None:
            supersede_query["file_id"] = selection.get("file_id")
        elif selection.get("tab_id"):
            supersede_query["tab_id"] = selection.get("tab_id")
        now_job = datetime.utcnow()
        await mongo_db["research_jobs"].update_many(
            supersede_query,
            {
                "$set": {
                    "status": "failed",
                    "error": "Superseded by a newer research run",
                    "updated_at": now_job,
                }
            },
        )

        job_id = await get_next_sequence(mongo_db, "research_jobs")
        table_row_indices = [
            int(row_indices[i]) if i < len(row_indices) else i for i in range(len(rows))
        ]
        await mongo_db["research_jobs"].insert_one(
            {
                "id": job_id,
                "owner_id": user.id,
                "status": "running",
                "selection_id": selection_id,
                "file_id": selection.get("file_id"),
                "tab_id": selection.get("tab_id"),
                "table_row_indices": table_row_indices,
                "completed_rows": 0,
                "total_rows": len(rows),
                "total_urls": 0,
                "error": None,
                "started_at": now_job,
                "updated_at": now_job,
            }
        )

        for row_index, row_data in enumerate(rows):
            row_values = [str(v).strip() for v in row_data if v]
            if not row_values:
                completed_rows += 1
                await mongo_db["research_jobs"].update_one(
                    {"id": job_id, "owner_id": user.id},
                    {
                        "$set": {
                            "completed_rows": completed_rows,
                            "updated_at": datetime.utcnow(),
                        }
                    },
                )
                continue

            # Use space-separated values only (no header-based logic)
            search_query = " ".join(row_values)

            try:
                result = await search_serper(
                    settings.serper_api_key, search_query, num=10
                )
                organic_results = extract_organic_results_from_serper_response(result)
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"Serper API error for row {row_index + 1}: {e!s}",
                )

            urls = [r["link"] for r in organic_results]
            table_row_index = row_indices[row_index] if row_index < len(row_indices) else row_index
            now = datetime.utcnow()
            new_id = await get_next_sequence(mongo_db, "research_urls")
            doc = {
                "id": new_id,
                "owner_id": user.id,
                "selection_id": selection_id,
                "row_index": row_index,
                "table_row_index": table_row_index,
                "tab_id": selection.get("tab_id"),
                "file_id": selection.get("file_id"),
                "search_query": search_query,
                "urls": urls,
                "results": organic_results,
                "headers": headers,
                "row_data": row_data,
                "created_at": now,
            }
            await mongo_db["research_urls"].insert_one(doc)
            ai_query = (body.ai_query if body else None) or ""
            if not ai_query.strip():
                ai_query = "Extract product specifications, pricing (keep prices with currency symbols like $, €, £), availability, part numbers, and key information from this page. Return as structured JSON."
            if urls and settings.firecrawl_api_key:
                sem = asyncio.Semaphore(5)

                async def scrape_one(u: str):
                    async with sem:
                        data = await scrape_url_with_ai_extraction(
                            settings.firecrawl_api_key,
                            u,
                            ai_query,
                        )
                        return (u, data) if (data and isinstance(data, dict) and len(data) > 0) else None

                raw_results = await asyncio.gather(*[scrape_one(u) for u in urls])
                results = [(r[0], r[1]) for r in raw_results if r is not None]

                for scraped_url, scraped in results:
                    now_scrape = datetime.utcnow()
                    prior = await _find_prior_scraped_for_url(
                        mongo_db,
                        owner_id=user.id,
                        url=scraped_url,
                        file_id=selection.get("file_id"),
                        tab_id=selection.get("tab_id"),
                        table_row_index=table_row_index,
                    )
                    base_data: dict = {}
                    prior_log = None
                    if prior and isinstance(prior.get("data"), dict):
                        # Prefer cleaned view of prior source when available.
                        prior_cleaned = await mongo_db["research_cleaned_data"].find_one(
                            {"research_scraped_id": prior.get("id"), "owner_id": user.id},
                            sort=[("created_at", -1)],
                        )
                        if prior_cleaned and isinstance(prior_cleaned.get("data"), dict):
                            base_data = prior_cleaned["data"]
                        else:
                            base_data = prior["data"]
                        prior_log = prior.get("change_log")

                    merged, _updated, _added, field_changes = _merge_scraped_field_dicts(
                        base_data, scraped
                    )
                    # No prior scrape for this source means this is the first-ever
                    # capture, not a change worth tracking as "added" noise.
                    if prior is None:
                        field_changes = []
                    change_log = _append_change_log(prior_log, field_changes)
                    scraped_id = await get_next_sequence(mongo_db, "research_scraped_data")
                    scraped_doc = {
                        "id": scraped_id,
                        "owner_id": user.id,
                        "research_url_id": new_id,
                        "url": scraped_url,
                        "data": merged,
                        "created_at": now_scrape,
                        "updated_at": now_scrape,
                        "change_log": change_log,
                        "last_field_changes": field_changes,
                    }
                    await mongo_db["research_scraped_data"].insert_one(scraped_doc)
            research_url_ids.append(new_id)
            total_urls += len(urls)
            completed_rows += 1
            await mongo_db["research_jobs"].update_one(
                {"id": job_id, "owner_id": user.id},
                {
                    "$set": {
                        "completed_rows": completed_rows,
                        "total_urls": total_urls,
                        "updated_at": datetime.utcnow(),
                    }
                },
            )

        await mongo_db["research_jobs"].update_one(
            {"id": job_id, "owner_id": user.id},
            {
                "$set": {
                    "status": "done",
                    "completed_rows": completed_rows,
                    "total_urls": total_urls,
                    "updated_at": datetime.utcnow(),
                    "error": None,
                }
            },
        )
    except Exception as e:
        if job_id is not None:
            err_msg = e.detail if isinstance(e, HTTPException) else str(e)
            if not isinstance(err_msg, str):
                err_msg = str(err_msg)
            await mongo_db["research_jobs"].update_one(
                {"id": job_id, "owner_id": user.id},
                {
                    "$set": {
                        "status": "failed",
                        "error": err_msg[:1000],
                        "completed_rows": completed_rows,
                        "total_urls": total_urls,
                        "updated_at": datetime.utcnow(),
                    }
                },
            )
        raise

    return ResearchSearchResponse(
        selection_id=selection_id,
        rows_searched=len(research_url_ids),
        total_urls=total_urls,
        research_url_ids=research_url_ids,
    )


async def _get_or_create_cleaned_data(
    mongo_db: AsyncIOMotorDatabase,
    scraped_docs: list[dict],
    research_url_id: int,
    owner_id: int,
    groq_api_key: str,
    groq_model: str,
) -> list[dict]:
    """
    For each scraped item: use cleaned data from research_cleaned_data if present,
    else clean with Groq, store in research_cleaned_data, then return.
    """
    if not scraped_docs:
        return []

    async def process_one(s: dict) -> dict:
        scraped_id = s.get("id")
        url = s.get("url", "")
        raw_data = s.get("data") or {}
        if not isinstance(raw_data, dict):
            return {
                "id": scraped_id,
                "url": url,
                "data": raw_data,
                "last_field_changes": s.get("last_field_changes") or [],
                "change_log": s.get("change_log") or [],
            }

        # Check if we have stored cleaned data
        if scraped_id is not None:
            existing = await mongo_db["research_cleaned_data"].find_one(
                {"research_scraped_id": scraped_id, "owner_id": owner_id}
            )
            if existing and isinstance(existing.get("data"), dict):
                return {
                    "id": scraped_id,
                    "url": url,
                    "data": existing["data"],
                    "last_field_changes": s.get("last_field_changes") or [],
                    "change_log": s.get("change_log") or [],
                }

        # Clean with Groq (or use raw if no key)
        cleaned = None
        if groq_api_key:
            cleaned = await clean_structured_data(groq_api_key, raw_data, model=groq_model)
        data_to_use = cleaned if cleaned else raw_data

        # Store in research_cleaned_data
        if scraped_id is not None and cleaned:
            clean_id = await get_next_sequence(mongo_db, "research_cleaned_data")
            await mongo_db["research_cleaned_data"].insert_one({
                "id": clean_id,
                "owner_id": owner_id,
                "research_scraped_id": scraped_id,
                "research_url_id": research_url_id,
                "url": url,
                "data": data_to_use,
                "created_at": datetime.utcnow(),
            })

        return {
            "id": scraped_id,
            "url": url,
            "data": data_to_use,
            "last_field_changes": s.get("last_field_changes") or [],
            "change_log": s.get("change_log") or [],
        }

    return await asyncio.gather(*[process_one(s) for s in scraped_docs])


async def _load_cleaned_by_scraped_ids(
    mongo_db: AsyncIOMotorDatabase,
    owner_id: int,
    scraped_ids: list,
) -> dict:
    """One Mongo round-trip for cleaned payloads keyed by research_scraped_id."""
    ids = [sid for sid in scraped_ids if sid is not None]
    if not ids:
        return {}
    cursor = mongo_db["research_cleaned_data"].find(
        {"owner_id": owner_id, "research_scraped_id": {"$in": ids}},
        {"research_scraped_id": 1, "data": 1},
    )
    docs = await cursor.to_list(length=max(len(ids) * 2, 1))
    out: dict = {}
    for d in docs:
        sid = d.get("research_scraped_id")
        data = d.get("data")
        if sid is not None and isinstance(data, dict):
            out[sid] = data
    return out


def _scraped_payloads_fast(
    scraped_docs: list[dict],
    cleaned_by_id: dict,
) -> list[dict]:
    """Map scraped docs to {id, url, data, ...} using cached cleaned data, else raw. No LLM."""
    result: list[dict] = []
    for s in scraped_docs:
        scraped_id = s.get("id")
        url = s.get("url", "")
        raw_data = s.get("data") or {}
        data = (
            cleaned_by_id[scraped_id]
            if scraped_id is not None and scraped_id in cleaned_by_id
            else raw_data
        )
        result.append(
            {
                "id": scraped_id,
                "url": url,
                "data": data,
                "last_field_changes": s.get("last_field_changes") or [],
                "change_log": s.get("change_log") or [],
            }
        )
    return result


def _jsonish_value(value) -> object:
    """Normalize values for before/after tracking (JSON-serializable)."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, dict)):
        return value
    return str(value)


def _merge_scraped_field_dicts(
    existing: dict, incoming: dict
) -> tuple[dict, list[str], list[str], list[dict]]:
    """
    Merge extraction results into existing structured data.
    - Updates existing keys when the new value is non-empty and different
    - Adds new keys as new columns
    Returns (merged, updated_fields, new_fields, field_changes).
    field_changes entries: {field, before, after, kind: "updated"|"added"}
    """
    merged: dict = dict(existing) if isinstance(existing, dict) else {}
    updated: list[str] = []
    added: list[str] = []
    changes: list[dict] = []
    if not isinstance(incoming, dict):
        return merged, updated, added, changes

    for raw_key, value in incoming.items():
        key = str(raw_key).strip()
        if not key:
            continue
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        if isinstance(value, (list, dict)) and len(value) == 0:
            continue

        if key in merged:
            if merged.get(key) != value:
                before = _jsonish_value(merged.get(key))
                merged[key] = value
                updated.append(key)
                changes.append(
                    {
                        "field": key,
                        "before": before,
                        "after": _jsonish_value(value),
                        "kind": "updated",
                    }
                )
        else:
            merged[key] = value
            added.append(key)
            changes.append(
                {
                    "field": key,
                    "before": None,
                    "after": _jsonish_value(value),
                    "kind": "added",
                }
            )
    return merged, updated, added, changes


def _append_change_log(existing_log: object, field_changes: list[dict], *, limit: int = 40) -> list[dict]:
    """Prepend a timestamped change batch onto the scraped change_log."""
    log: list[dict] = []
    if isinstance(existing_log, list):
        log = [e for e in existing_log if isinstance(e, dict)]
    if not field_changes:
        return log[:limit]
    entry = {
        "at": datetime.utcnow().isoformat() + "Z",
        "changes": field_changes,
    }
    return [entry, *log][:limit]


async def _find_prior_scraped_for_url(
    mongo_db: AsyncIOMotorDatabase,
    *,
    owner_id: int,
    url: str,
    file_id: int | None,
    tab_id: str | None,
    table_row_index: int | None,
) -> dict | None:
    """Most recent scraped doc for the same source URL on this sheet row (any prior research run)."""
    if not url or table_row_index is None:
        return None
    ru_query: dict = {"owner_id": owner_id, "table_row_index": table_row_index}
    if file_id is not None:
        ru_query["file_id"] = file_id
    elif tab_id:
        ru_query["tab_id"] = tab_id
    else:
        return None
    prior_research = (
        await mongo_db["research_urls"]
        .find(ru_query, {"id": 1})
        .sort([("created_at", -1)])
        .to_list(length=50)
    )
    prior_ids = [d["id"] for d in prior_research if d.get("id") is not None]
    if not prior_ids:
        return None
    return await mongo_db["research_scraped_data"].find_one(
        {
            "owner_id": owner_id,
            "url": url,
            "research_url_id": {"$in": prior_ids},
        },
        sort=[("updated_at", -1), ("created_at", -1)],
    )


async def _attach_scraped_for_docs(
    mongo_db: AsyncIOMotorDatabase,
    docs: list[dict],
    owner_id: int,
    *,
    fast: bool,
    groq_api_key: str,
    groq_model: str,
) -> list[dict]:
    """
    Attach scraped_data to research_url docs.
    fast=True: batch cleaned lookup, never call Groq, omit heavy search results.
    """
    if not docs:
        return []
    ids = [d["id"] for d in docs]
    scraped_cursor = mongo_db["research_scraped_data"].find(
        {"research_url_id": {"$in": ids}, "owner_id": owner_id}
    ).sort([("research_url_id", 1), ("created_at", 1)])
    scraped_list = await scraped_cursor.to_list(length=max(len(ids) * 20, 1))
    scraped_by_url: dict[int, list] = {}
    for s in scraped_list:
        rid = s["research_url_id"]
        if rid not in scraped_by_url:
            scraped_by_url[rid] = []
        scraped_by_url[rid].append(s)

    cleaned_by_id: dict = {}
    if fast:
        scraped_ids = [s.get("id") for s in scraped_list]
        cleaned_by_id = await _load_cleaned_by_scraped_ids(mongo_db, owner_id, scraped_ids)

    result: list[dict] = []
    for d in docs:
        scraped_docs = scraped_by_url.get(d["id"])
        if not scraped_docs and d.get("scraped_data"):
            scraped_docs = [{"id": None, "url": "", "data": d["scraped_data"]}]
        scraped_data: list = []
        if scraped_docs:
            if fast:
                scraped_data = _scraped_payloads_fast(scraped_docs, cleaned_by_id)
            else:
                scraped_data = await _get_or_create_cleaned_data(
                    mongo_db,
                    scraped_docs,
                    d["id"],
                    owner_id,
                    groq_api_key,
                    groq_model,
                )
        item = {
            "id": d["id"],
            "selection_id": d["selection_id"],
            "row_index": d["row_index"],
            "table_row_index": d.get("table_row_index"),
            "file_id": d.get("file_id"),
            "search_query": d["search_query"],
            "urls": d.get("urls", []),
            "results": [] if fast else d.get("results", []),
            "scraped_data": scraped_data or [],
            "headers": d.get("headers", []),
            "row_data": d.get("row_data", []),
            "created_at": d["created_at"],
        }
        result.append(item)
    return result


def _doc_recency_key(doc: dict) -> tuple[float, int]:
    """Sort key: newer created_at wins; tie-break on id."""
    ts = doc.get("created_at")
    if hasattr(ts, "timestamp"):
        try:
            t = float(ts.timestamp())
        except (OSError, TypeError, ValueError):
            t = 0.0
    else:
        t = 0.0
    return (t, int(doc.get("id") or 0))


def _table_row_index_as_int(value) -> int | None:
    """Normalize Mongo/BSON row index for dict keys (matches frontend data row indices)."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


@router.post(
    "/research-urls/{research_url_id}/sources/research-more",
    response_model=ResearchMoreSourceResponse,
)
async def research_more_existing_source(
    research_url_id: int,
    body: ResearchMoreSourceBody,
    user: Annotated[User, Depends(get_current_user)] = ...,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = ...,
):
    """
    Re-scrape a single already-stored source URL with a custom prompt.
    Merges returned fields into that source only (updates existing keys, adds new columns).
    Does not search for new URLs or touch other sources on the row.
    """
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    ai_query = (body.ai_query or "").strip()
    if not ai_query:
        raise HTTPException(status_code=400, detail="ai_query is required")
    if len(ai_query) > 4000:
        raise HTTPException(status_code=400, detail="ai_query is too long (max 4000 characters)")

    research_doc = await mongo_db["research_urls"].find_one(
        {"id": research_url_id, "owner_id": user.id}
    )
    if not research_doc:
        raise HTTPException(status_code=404, detail="Research URL record not found")

    scraped_doc = await mongo_db["research_scraped_data"].find_one(
        {
            "id": body.scraped_id,
            "owner_id": user.id,
            "research_url_id": research_url_id,
        }
    )
    if not scraped_doc:
        raise HTTPException(status_code=404, detail="Scraped source not found for this research row")

    source_url = str(scraped_doc.get("url") or "").strip()
    if not source_url:
        raise HTTPException(status_code=400, detail="Selected source has no URL to re-scrape")
    if not (source_url.startswith("http://") or source_url.startswith("https://")):
        raise HTTPException(status_code=400, detail="Selected source URL is not http(s)")

    settings = get_settings()
    if not settings.firecrawl_api_key:
        raise HTTPException(
            status_code=500,
            detail="FIRECRAWL_API_KEY is not configured. Add it to .env.development",
        )

    try:
        extracted = await scrape_url_with_ai_extraction(
            settings.firecrawl_api_key,
            source_url,
            ai_query,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scrape failed: {e!s}") from e

    if not extracted or not isinstance(extracted, dict):
        raise HTTPException(
            status_code=502,
            detail="No structured data returned for this source. Try a more specific prompt.",
        )

    existing_raw = scraped_doc.get("data") if isinstance(scraped_doc.get("data"), dict) else {}
    # Prefer merging onto cleaned view if present so UI fields stay consistent.
    cleaned_existing = await mongo_db["research_cleaned_data"].find_one(
        {"research_scraped_id": body.scraped_id, "owner_id": user.id}
    )
    base_data = (
        cleaned_existing.get("data")
        if cleaned_existing and isinstance(cleaned_existing.get("data"), dict)
        else existing_raw
    )
    merged, updated_fields, new_fields, field_changes = _merge_scraped_field_dicts(base_data, extracted)

    now = datetime.utcnow()
    change_log = _append_change_log(scraped_doc.get("change_log"), field_changes)
    await mongo_db["research_scraped_data"].update_one(
        {"id": body.scraped_id, "owner_id": user.id},
        {
            "$set": {
                "data": merged,
                "updated_at": now,
                "change_log": change_log,
                "last_field_changes": field_changes,
            }
        },
    )

    # Refresh cleaned cache so list endpoints return the merged payload.
    await mongo_db["research_cleaned_data"].delete_many(
        {"research_scraped_id": body.scraped_id, "owner_id": user.id}
    )
    data_to_store = merged
    if settings.groq_api_key:
        cleaned = await clean_structured_data(
            settings.groq_api_key, merged, model=settings.groq_model
        )
        if cleaned and isinstance(cleaned, dict):
            # Keep newly extracted values even if the cleaner drops/renames some keys.
            data_to_store, _, _, _ = _merge_scraped_field_dicts(cleaned, extracted)

    clean_id = await get_next_sequence(mongo_db, "research_cleaned_data")
    await mongo_db["research_cleaned_data"].insert_one(
        {
            "id": clean_id,
            "owner_id": user.id,
            "research_scraped_id": body.scraped_id,
            "research_url_id": research_url_id,
            "url": source_url,
            "data": data_to_store,
            "created_at": now,
        }
    )

    return ResearchMoreSourceResponse(
        research_url_id=research_url_id,
        scraped_id=body.scraped_id,
        url=source_url,
        data=data_to_store,
        updated_fields=updated_fields,
        new_fields=new_fields,
        field_changes=field_changes,
        change_log=change_log,
    )


async def _copy_scraped_and_cleaned_for_research(
    mongo_db: AsyncIOMotorDatabase,
    *,
    owner_id: int,
    source_research_url_id: int,
    dest_research_url_id: int,
) -> int:
    """Duplicate scraped (+ cleaned) docs linked to a research_urls id. Returns scraped count."""
    scraped_docs = await mongo_db["research_scraped_data"].find(
        {"owner_id": owner_id, "research_url_id": source_research_url_id}
    ).to_list(length=500)
    copied = 0
    for s in scraped_docs:
        old_scraped_id = s.get("id")
        new_scraped_id = await get_next_sequence(mongo_db, "research_scraped_data")
        scraped_copy = {
            k: v
            for k, v in s.items()
            if k not in ("_id", "id", "research_url_id", "created_at")
        }
        scraped_copy["id"] = new_scraped_id
        scraped_copy["owner_id"] = owner_id
        scraped_copy["research_url_id"] = dest_research_url_id
        scraped_copy["created_at"] = datetime.utcnow()
        await mongo_db["research_scraped_data"].insert_one(scraped_copy)
        copied += 1

        if old_scraped_id is None:
            continue
        cleaned_docs = await mongo_db["research_cleaned_data"].find(
            {"owner_id": owner_id, "research_scraped_id": old_scraped_id}
        ).to_list(length=50)
        for c in cleaned_docs:
            new_cleaned_id = await get_next_sequence(mongo_db, "research_cleaned_data")
            cleaned_copy = {
                k: v
                for k, v in c.items()
                if k not in ("_id", "id", "research_scraped_id", "created_at")
            }
            cleaned_copy["id"] = new_cleaned_id
            cleaned_copy["owner_id"] = owner_id
            cleaned_copy["research_scraped_id"] = new_scraped_id
            cleaned_copy["created_at"] = datetime.utcnow()
            await mongo_db["research_cleaned_data"].insert_one(cleaned_copy)
    return copied


@router.post("/research-urls/transfer", response_model=ResearchTransferResponse)
async def transfer_research_urls(
    body: ResearchTransferRequest,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    """
    Move or duplicate research results when sheet rows are transferred between files/tabs.
    Scraped/cleaned data stays linked on move (research_url_id unchanged); on duplicate
    those collections are copied under new research_url ids.
    """
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    if body.source_file_id is None and not body.source_tab_id:
        raise HTTPException(status_code=400, detail="Provide source_file_id or source_tab_id")
    if body.dest_file_id is None and not body.dest_tab_id:
        raise HTTPException(status_code=400, detail="Provide dest_file_id or dest_tab_id")
    if not body.row_map:
        return ResearchTransferResponse(
            mode=body.mode,
            rows_matched=0,
            research_docs_touched=0,
            scraped_docs_copied=0,
        )

    for m in body.row_map:
        if m.source_table_row_index > 1_000_000 or m.dest_table_row_index > 1_000_000:
            raise HTTPException(status_code=400, detail="Invalid table_row_index in row_map")

    source_query: dict = {"owner_id": user.id}
    if body.source_file_id is not None:
        source_query["file_id"] = body.source_file_id
    else:
        source_query["tab_id"] = body.source_tab_id

    docs_touched = 0
    scraped_copied = 0
    rows_matched = 0

    for mapping in body.row_map:
        q = {**source_query, "table_row_index": mapping.source_table_row_index}
        docs = await mongo_db["research_urls"].find(q).to_list(length=200)
        if not docs:
            continue
        rows_matched += 1

        if body.mode == "move":
            update_fields: dict = {
                "table_row_index": mapping.dest_table_row_index,
                "file_id": body.dest_file_id,
                "tab_id": body.dest_tab_id,
            }
            result = await mongo_db["research_urls"].update_many(
                q,
                {"$set": update_fields},
            )
            docs_touched += int(result.modified_count or 0)
        else:
            for d in docs:
                old_id = d.get("id")
                if old_id is None:
                    continue
                new_id = await get_next_sequence(mongo_db, "research_urls")
                copy_doc = {
                    k: v
                    for k, v in d.items()
                    if k
                    not in (
                        "_id",
                        "id",
                        "file_id",
                        "tab_id",
                        "table_row_index",
                        "created_at",
                    )
                }
                copy_doc["id"] = new_id
                copy_doc["owner_id"] = user.id
                copy_doc["file_id"] = body.dest_file_id
                copy_doc["tab_id"] = body.dest_tab_id
                copy_doc["table_row_index"] = mapping.dest_table_row_index
                copy_doc["created_at"] = datetime.utcnow()
                await mongo_db["research_urls"].insert_one(copy_doc)
                docs_touched += 1
                scraped_copied += await _copy_scraped_and_cleaned_for_research(
                    mongo_db,
                    owner_id=user.id,
                    source_research_url_id=int(old_id),
                    dest_research_url_id=new_id,
                )

    return ResearchTransferResponse(
        mode=body.mode,
        rows_matched=rows_matched,
        research_docs_touched=docs_touched,
        scraped_docs_copied=scraped_copied,
    )


@router.get("/research-urls/grid-summary")
async def research_urls_grid_summary(
    tab_id: str | None = None,
    file_id: int | None = None,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    """
    Per-table-row counts for this sheet (file or tab).
    Uses the most recent research_urls document per table_row_index across all runs,
    matching list_research_urls(file_id/tab_id + table_row_index).
    """
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    if file_id is None and not tab_id:
        raise HTTPException(
            status_code=400,
            detail="Provide file_id or tab_id",
        )

    if file_id is not None:
        docs = await mongo_db["research_urls"].find(
            {"owner_id": user.id, "file_id": file_id}
        ).to_list(length=5000)
    else:
        docs = await mongo_db["research_urls"].find(
            {"owner_id": user.id, "tab_id": tab_id}
        ).to_list(length=5000)
    if not docs:
        return []

    by_table_row: dict[int, dict] = {}
    for d in docs:
        tri = _table_row_index_as_int(d.get("table_row_index"))
        if tri is None:
            continue
        prev = by_table_row.get(tri)
        if prev is None or _doc_recency_key(d) > _doc_recency_key(prev):
            by_table_row[tri] = d

    url_ids = [d["id"] for d in by_table_row.values()]
    scraped_counts: dict[int, int] = {}
    if url_ids:
        pipeline = [
            {"$match": {"research_url_id": {"$in": url_ids}, "owner_id": user.id}},
            {"$group": {"_id": "$research_url_id", "n": {"$sum": 1}}},
        ]
        agg = await mongo_db["research_scraped_data"].aggregate(pipeline).to_list(
            length=len(url_ids) + 1
        )
        scraped_counts = {int(row["_id"]): int(row["n"]) for row in agg}

    out: list[dict] = []
    for tri in sorted(by_table_row.keys()):
        d = by_table_row[tri]
        rid = int(d["id"])
        n_scraped = scraped_counts.get(rid, 0)
        if n_scraped == 0 and d.get("scraped_data"):
            n_scraped = 1
        results = d.get("results") or []
        n_results = len(results)
        out.append(
            {
                "table_row_index": tri,
                "results_count": n_results,
                "structured_sources_count": n_scraped,
                "has_structured_data": n_scraped > 0,
            }
        )
    return out


@router.get("/research-urls")
async def list_research_urls(
    selection_id: int | None = None,
    tab_id: str | None = None,
    file_id: int | None = None,
    table_row_index: int | None = None,
    fast: bool = False,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    """List research URLs. Filter by selection_id, or by file_id/tab_id+table_row_index to fetch from MongoDB.

    fast=True: skip Groq cleaning, batch-read cached cleaned data, omit search results
    (for wishlist/catalog loads).
    """
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    settings = get_settings()

    # Batch list: all research rows for a workspace file or tab (deduped by table_row_index).
    if table_row_index is None and selection_id is None:
        query_filter: dict | None = None
        if file_id is not None:
            query_filter = {"owner_id": user.id, "file_id": file_id}
        elif tab_id is not None:
            query_filter = {"owner_id": user.id, "tab_id": tab_id}
        if query_filter is not None:
            raw_docs = await mongo_db["research_urls"].find(query_filter).to_list(
                length=5000
            )
            by_table_row: dict[int, dict] = {}
            for d in raw_docs:
                tri = _table_row_index_as_int(d.get("table_row_index"))
                if tri is None:
                    continue
                prev = by_table_row.get(tri)
                if prev is None or _doc_recency_key(d) > _doc_recency_key(prev):
                    by_table_row[tri] = d
            sorted_docs = [by_table_row[k] for k in sorted(by_table_row.keys())]
            return await _attach_scraped_for_docs(
                mongo_db,
                sorted_docs,
                user.id,
                fast=fast,
                groq_api_key=settings.groq_api_key,
                groq_model=settings.groq_model,
            )

    if table_row_index is not None and (file_id is not None or tab_id is not None):
        query: dict = {"owner_id": user.id, "table_row_index": table_row_index}
        if file_id is not None:
            query["file_id"] = file_id
        elif tab_id is not None:
            query["tab_id"] = tab_id
        doc = await mongo_db["research_urls"].find_one(
            query,
            sort=[("created_at", -1)],
        )
        if doc:
            return await _attach_scraped_for_docs(
                mongo_db,
                [doc],
                user.id,
                fast=fast,
                groq_api_key=settings.groq_api_key,
                groq_model=settings.groq_model,
            )
        if file_id is not None:
            selection = await mongo_db["data_sheet_selections"].find_one(
                {"owner_id": user.id, "file_id": file_id},
                sort=[("created_at", -1)],
            )
        else:
            selection = await mongo_db["data_sheet_selections"].find_one(
                {"owner_id": user.id, "tab_id": tab_id},
                sort=[("created_at", -1)],
            )
        if selection:
            row_indices = selection.get("row_indices") or list(
                range(len(selection.get("rows") or []))
            )
            try:
                row_index = row_indices.index(table_row_index)
            except ValueError:
                row_index = None
            if row_index is not None:
                doc = await mongo_db["research_urls"].find_one(
                    {
                        "owner_id": user.id,
                        "selection_id": selection["id"],
                        "row_index": row_index,
                    },
                    sort=[("created_at", -1)],
                )
                if doc:
                    return await _attach_scraped_for_docs(
                        mongo_db,
                        [doc],
                        user.id,
                        fast=fast,
                        groq_api_key=settings.groq_api_key,
                        groq_model=settings.groq_model,
                    )
        return []

    query = {"owner_id": user.id}
    if selection_id is not None:
        query["selection_id"] = selection_id

    cursor = mongo_db["research_urls"].find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    return await _attach_scraped_for_docs(
        mongo_db,
        docs,
        user.id,
        fast=fast,
        groq_api_key=settings.groq_api_key,
        groq_model=settings.groq_model,
    )
