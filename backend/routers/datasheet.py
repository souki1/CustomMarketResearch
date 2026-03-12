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
    ResearchSearchBody,
    ResearchSearchResponse,
)
from data.groq_client import clean_structured_data
from data.scrapingbee_client import scrape_url_with_ai_extraction
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

    for row_index, row_data in enumerate(rows):
        row_values = [str(v).strip() for v in row_data if v]
        if not row_values:
            continue

        # Format as "value1"+"value2" for exact phrase search in Serper/Google
        search_query = "+".join(f'"{v}"' for v in row_values)

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
        if urls and settings.scrapingbee_api_key and ai_query.strip():
            sem = asyncio.Semaphore(5)

            async def scrape_one(u: str):
                async with sem:
                    data = await scrape_url_with_ai_extraction(
                        settings.scrapingbee_api_key,
                        u,
                        ai_query,
                        premium_proxy=settings.scrapingbee_premium_proxy,
                    )
                    return (u, data) if (data and isinstance(data, dict) and len(data) > 0) else None

            raw_results = await asyncio.gather(*[scrape_one(u) for u in urls])
            results = [(r[0], r[1]) for r in raw_results if r is not None]

            for scraped_url, scraped in results:
                scraped_id = await get_next_sequence(mongo_db, "research_scraped_data")
                scraped_doc = {
                    "id": scraped_id,
                    "owner_id": user.id,
                    "research_url_id": new_id,
                    "url": scraped_url,
                    "data": scraped,
                    "created_at": datetime.utcnow(),
                }
                await mongo_db["research_scraped_data"].insert_one(scraped_doc)
        research_url_ids.append(new_id)
        total_urls += len(urls)

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
            return {"url": url, "data": raw_data}

        # Check if we have stored cleaned data
        if scraped_id is not None:
            existing = await mongo_db["research_cleaned_data"].find_one(
                {"research_scraped_id": scraped_id, "owner_id": owner_id}
            )
            if existing and isinstance(existing.get("data"), dict):
                return {"url": url, "data": existing["data"]}

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

        return {"url": url, "data": data_to_use}

    return await asyncio.gather(*[process_one(s) for s in scraped_docs])


@router.get("/research-urls")
async def list_research_urls(
    selection_id: int | None = None,
    tab_id: str | None = None,
    file_id: int | None = None,
    table_row_index: int | None = None,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    """List research URLs. Filter by selection_id, or by file_id/tab_id+table_row_index to fetch from MongoDB."""
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")
    settings = get_settings()

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
            scraped_cursor = mongo_db["research_scraped_data"].find(
                {"research_url_id": doc["id"], "owner_id": user.id}
            ).sort("created_at", 1)
            scraped_docs = await scraped_cursor.to_list(length=20)
            if not scraped_docs and doc.get("scraped_data"):
                scraped_docs = [{"id": None, "url": "", "data": doc["scraped_data"]}]
            scraped_data = await _get_or_create_cleaned_data(
                mongo_db, scraped_docs, doc["id"], user.id,
                settings.groq_api_key, settings.groq_model,
            )
            return [
                {
                    "id": doc["id"],
                    "selection_id": doc["selection_id"],
                    "row_index": doc["row_index"],
                    "table_row_index": doc.get("table_row_index"),
                    "search_query": doc["search_query"],
                    "urls": doc.get("urls", []),
                    "results": doc.get("results", []),
                    "scraped_data": scraped_data,
                    "headers": doc.get("headers", []),
                    "row_data": doc.get("row_data", []),
                    "created_at": doc["created_at"],
                }
            ]
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
                    scraped_cursor = mongo_db["research_scraped_data"].find(
                        {"research_url_id": doc["id"], "owner_id": user.id}
                    ).sort("created_at", 1)
                    scraped_docs = await scraped_cursor.to_list(length=20)
                    if not scraped_docs and doc.get("scraped_data"):
                        scraped_docs = [{"id": None, "url": "", "data": doc["scraped_data"]}]
                    scraped_data = await _get_or_create_cleaned_data(
                        mongo_db, scraped_docs, doc["id"], user.id,
                        settings.groq_api_key, settings.groq_model,
                    )
                    return [
                        {
                            "id": doc["id"],
                            "selection_id": doc["selection_id"],
                            "row_index": doc["row_index"],
                            "table_row_index": doc.get("table_row_index"),
                            "search_query": doc["search_query"],
                            "urls": doc.get("urls", []),
                            "results": doc.get("results", []),
                            "scraped_data": scraped_data,
                            "headers": doc.get("headers", []),
                            "row_data": doc.get("row_data", []),
                            "created_at": doc["created_at"],
                        }
                    ]
        return []

    query = {"owner_id": user.id}
    if selection_id is not None:
        query["selection_id"] = selection_id

    cursor = mongo_db["research_urls"].find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    ids = [d["id"] for d in docs]
    scraped_cursor = mongo_db["research_scraped_data"].find(
        {"research_url_id": {"$in": ids}, "owner_id": user.id}
    ).sort([("research_url_id", 1), ("created_at", 1)])
    scraped_list = await scraped_cursor.to_list(length=len(ids) * 20)
    scraped_by_url: dict[int, list] = {}
    for s in scraped_list:
        rid = s["research_url_id"]
        if rid not in scraped_by_url:
            scraped_by_url[rid] = []
        scraped_by_url[rid].append(s)
    result = []
    for d in docs:
        scraped_docs = scraped_by_url.get(d["id"])
        if not scraped_docs and d.get("scraped_data"):
            scraped_docs = [{"id": None, "url": "", "data": d["scraped_data"]}]
        scraped_data = []
        if scraped_docs:
            scraped_data = await _get_or_create_cleaned_data(
                mongo_db, scraped_docs, d["id"], user.id,
                settings.groq_api_key, settings.groq_model,
            )
        result.append({
            "id": d["id"],
            "selection_id": d["selection_id"],
            "row_index": d["row_index"],
            "table_row_index": d.get("table_row_index"),
            "search_query": d["search_query"],
            "urls": d.get("urls", []),
            "results": d.get("results", []),
            "scraped_data": scraped_data or [],
            "headers": d.get("headers", []),
            "row_data": d.get("row_data", []),
            "created_at": d["created_at"],
        })
    return result
