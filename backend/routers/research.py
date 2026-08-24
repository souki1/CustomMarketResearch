from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db
from schemas import ResearchStateResponse, ResearchStateUpsert, ResearchJobResponse

router = APIRouter(prefix="/research", tags=["research"])


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


def _sanitize_open_tabs(raw: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            file_id = int(item.get("file_id"))
        except (TypeError, ValueError):
            continue
        if file_id <= 0 or file_id in seen:
            continue
        seen.add(file_id)
        name = str(item.get("name") or f"File {file_id}")[:500]
        folder_path = item.get("folder_path")
        out.append(
            {
                "file_id": file_id,
                "name": name,
                "folder_path": str(folder_path) if folder_path else None,
            }
        )
    return out[:50]


@router.get("/state", response_model=ResearchStateResponse | None)
async def get_research_state(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    doc = await mongo_db["research_states"].find_one({"owner_id": user.id})
    if not doc:
        return None

    return ResearchStateResponse(
        owner_id=doc["owner_id"],
        open_tabs=_sanitize_open_tabs(doc.get("open_tabs") or []),
        active_file_id=doc.get("active_file_id"),
        page_state=doc.get("page_state") or {},
        created_at=doc.get("created_at", datetime.utcnow()),
        updated_at=doc.get("updated_at", datetime.utcnow()),
    )


@router.put("/state", response_model=ResearchStateResponse)
async def upsert_research_state(
    payload: ResearchStateUpsert,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    open_tabs = _sanitize_open_tabs(payload.open_tabs)
    active_file_id = payload.active_file_id
    if active_file_id is not None:
        try:
            active_file_id = int(active_file_id)
        except (TypeError, ValueError):
            active_file_id = None
        if active_file_id is not None and active_file_id <= 0:
            active_file_id = None
        if active_file_id is not None and not any(t["file_id"] == active_file_id for t in open_tabs):
            active_file_id = open_tabs[0]["file_id"] if open_tabs else None

    page_state = payload.page_state if isinstance(payload.page_state, dict) else {}
    now = datetime.utcnow()
    update_doc = {
        "open_tabs": open_tabs,
        "active_file_id": active_file_id,
        "page_state": page_state,
        "updated_at": now,
    }

    await mongo_db["research_states"].update_one(
        {"owner_id": user.id},
        {
            "$set": update_doc,
            "$setOnInsert": {
                "owner_id": user.id,
                "created_at": now,
            },
        },
        upsert=True,
    )

    doc = await mongo_db["research_states"].find_one({"owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=500, detail="Failed to save research state")

    return ResearchStateResponse(
        owner_id=doc["owner_id"],
        open_tabs=_sanitize_open_tabs(doc.get("open_tabs") or []),
        active_file_id=doc.get("active_file_id"),
        page_state=doc.get("page_state") or {},
        created_at=doc.get("created_at", now),
        updated_at=doc.get("updated_at", now),
    )


def _job_to_response(doc: dict) -> ResearchJobResponse:
    return ResearchJobResponse(
        id=int(doc["id"]),
        status=doc.get("status") or "failed",
        selection_id=doc.get("selection_id"),
        file_id=doc.get("file_id"),
        tab_id=doc.get("tab_id"),
        table_row_indices=list(doc.get("table_row_indices") or []),
        completed_rows=int(doc.get("completed_rows") or 0),
        total_rows=int(doc.get("total_rows") or 0),
        total_urls=int(doc.get("total_urls") or 0),
        error=doc.get("error"),
        started_at=doc.get("started_at") or doc.get("created_at") or datetime.utcnow(),
        updated_at=doc.get("updated_at") or datetime.utcnow(),
    )


@router.get("/jobs/active", response_model=list[ResearchJobResponse])
async def list_active_research_jobs(
    file_id: int | None = None,
    tab_id: str | None = None,
    user: Annotated[User, Depends(get_current_user)] = ...,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = ...,
):
    """
    Running research jobs for this user (optionally scoped to a sheet file/tab).
    Used so another browser can show the same in-progress status and counts.
    """
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    query: dict[str, Any] = {"owner_id": user.id, "status": "running"}
    if file_id is not None:
        query["file_id"] = file_id
    elif tab_id:
        query["tab_id"] = tab_id

    # Auto-expire abandoned runs (e.g. server restart mid-scrape).
    stale_before = datetime.utcnow().timestamp() - 45 * 60
    cursor = mongo_db["research_jobs"].find(query).sort("updated_at", -1)
    docs = await cursor.to_list(length=20)
    active: list[ResearchJobResponse] = []
    for d in docs:
        started = d.get("started_at") or d.get("created_at") or d.get("updated_at")
        started_ts = started.timestamp() if isinstance(started, datetime) else None
        if started_ts is not None and started_ts < stale_before:
            await mongo_db["research_jobs"].update_one(
                {"id": d["id"], "owner_id": user.id},
                {
                    "$set": {
                        "status": "failed",
                        "error": "Timed out (no progress)",
                        "updated_at": datetime.utcnow(),
                    }
                },
            )
            continue
        active.append(_job_to_response(d))
    return active
