from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db, get_next_sequence
from schemas import (
    ResearchAgentAssignBody,
    ResearchAgentAssignmentResponse,
    ResearchAgentCreate,
    ResearchAgentFocus,
    ResearchAgentResponse,
    ResearchAgentUpdate,
    ResearchJobResponse,
    ResearchStateResponse,
    ResearchStateUpsert,
)

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


AGENTS_COLLECTION = "research_agents"
ASSIGNMENTS_COLLECTION = "research_agent_assignments"

_DEFAULT_RESEARCH_AGENTS: tuple[dict[str, str], ...] = (
    {
        "name": "Vendor finder",
        "focus": "vendors",
        "instructions": (
            "Find distributors and manufacturers that sell this exact part. "
            "Extract vendor name, website, location, authorized status, and whether they stock this part number."
        ),
        "search_hint": "distributor supplier authorized reseller",
    },
    {
        "name": "Price hunter",
        "focus": "pricing",
        "instructions": (
            "Extract current unit price, currency, quantity breaks, minimum order quantity, "
            "and any promotions or quote requirements."
        ),
        "search_hint": "price buy quote unit cost",
    },
    {
        "name": "Datasheet collector",
        "focus": "datasheets",
        "instructions": (
            "Find a direct PDF file for the official datasheet, spec sheet, or parts/operator manual. "
            "Extract datasheet_url only when it is a URL ending in .pdf — never a catalog or product page."
        ),
        "search_hint": 'filetype:pdf datasheet "spec sheet" "parts manual"',
    },
    {
        "name": "Availability scout",
        "focus": "availability",
        "instructions": (
            "Extract stock status, quantity available, lead time, and shipping or delivery estimates "
            "for this part at nearby vendors."
        ),
        "search_hint": "stock availability lead time shipping",
    },
    {
        "name": "Contact finder",
        "focus": "contacts",
        "instructions": (
            "Extract sales contact name, phone, email, and support channels for the vendor of this part."
        ),
        "search_hint": "contact sales phone email",
    },
    {
        "name": "Intelligence report writer",
        "focus": "document",
        "instructions": (
            "Write a detailed Supplier & Vendor Intelligence Report from researched sources. "
            "Include TL;DR, numbered key findings, genuine vs aftermarket analysis, pricing, "
            "related/alternate part numbers, and source URLs. Use only provided facts."
        ),
        "search_hint": 'supplier vendor OEM aftermarket "cross reference"',
    },
)


def _clip_printable(value: object, max_len: int) -> str:
    text = "".join(ch for ch in str(value or "") if ch.isprintable()).strip()
    return text[:max_len]


def _normalize_focus(raw: object) -> ResearchAgentFocus:
    value = str(raw or "custom").strip().lower()
    mapping: dict[str, ResearchAgentFocus] = {
        "vendors": "vendors",
        "pricing": "pricing",
        "datasheets": "datasheets",
        "contacts": "contacts",
        "availability": "availability",
        "document": "document",
        "custom": "custom",
    }
    return mapping.get(value, "custom")


def _agent_to_response(doc: dict) -> ResearchAgentResponse:
    return ResearchAgentResponse(
        id=int(doc["id"]),
        owner_id=int(doc["owner_id"]),
        name=str(doc.get("name") or "Agent"),
        focus=_normalize_focus(doc.get("focus")),
        instructions=str(doc.get("instructions") or ""),
        search_hint=doc.get("search_hint") or None,
        created_at=doc.get("created_at") or datetime.utcnow(),
        updated_at=doc.get("updated_at") or datetime.utcnow(),
        seeded=bool(doc.get("seeded")),
    )


def _assignment_to_response(
    doc: dict, agent: ResearchAgentResponse | None = None
) -> ResearchAgentAssignmentResponse:
    row_indices: list[int] = []
    for raw in doc.get("row_indices") or []:
        try:
            idx = int(raw)
        except (TypeError, ValueError):
            continue
        if idx >= 0:
            row_indices.append(idx)
    return ResearchAgentAssignmentResponse(
        id=int(doc["id"]),
        owner_id=int(doc["owner_id"]),
        agent_id=int(doc["agent_id"]),
        file_id=doc.get("file_id"),
        tab_id=doc.get("tab_id"),
        row_indices=row_indices,
        created_at=doc.get("created_at") or datetime.utcnow(),
        updated_at=doc.get("updated_at") or datetime.utcnow(),
        last_run_at=doc.get("last_run_at"),
        agent=agent,
    )


async def _seed_default_agents(
    mongo_db: AsyncIOMotorDatabase, owner_id: int
) -> list[ResearchAgentResponse]:
    now = datetime.utcnow()
    created: list[ResearchAgentResponse] = []
    for preset in _DEFAULT_RESEARCH_AGENTS:
        new_id = await get_next_sequence(mongo_db, AGENTS_COLLECTION)
        doc = {
            "id": new_id,
            "owner_id": owner_id,
            "name": preset["name"],
            "focus": preset["focus"],
            "instructions": preset["instructions"],
            "search_hint": preset["search_hint"],
            "seeded": True,
            "created_at": now,
            "updated_at": now,
        }
        await mongo_db[AGENTS_COLLECTION].insert_one(doc)
        created.append(_agent_to_response(doc))
    return created


@router.get("/agents", response_model=list[ResearchAgentResponse])
async def list_research_agents(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    cursor = mongo_db[AGENTS_COLLECTION].find({"owner_id": user.id}).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    if docs:
        out = [_agent_to_response(d) for d in docs]
        if not any(agent.focus == "document" for agent in out):
            preset = next(p for p in _DEFAULT_RESEARCH_AGENTS if p["focus"] == "document")
            now = datetime.utcnow()
            new_id = await get_next_sequence(mongo_db, AGENTS_COLLECTION)
            doc = {
                "id": new_id,
                "owner_id": user.id,
                "name": preset["name"],
                "focus": preset["focus"],
                "instructions": preset["instructions"],
                "search_hint": preset["search_hint"],
                "seeded": True,
                "created_at": now,
                "updated_at": now,
            }
            await mongo_db[AGENTS_COLLECTION].insert_one(doc)
            out.insert(0, _agent_to_response(doc))
        return out

    seeded = await mongo_db["research_agent_seeds"].find_one({"owner_id": user.id})
    if seeded:
        return []
    created = await _seed_default_agents(mongo_db, user.id)
    await mongo_db["research_agent_seeds"].insert_one(
        {"owner_id": user.id, "seeded_at": datetime.utcnow()}
    )
    return created


@router.post("/agents", response_model=ResearchAgentResponse, status_code=201)
async def create_research_agent(
    payload: ResearchAgentCreate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    name = _clip_printable(payload.name, 80)
    instructions = _clip_printable(payload.instructions, 4000)
    if not name:
        raise HTTPException(status_code=400, detail="Agent name is required")
    if not instructions:
        raise HTTPException(status_code=400, detail="Agent instructions are required")
    search_hint = _clip_printable(payload.search_hint, 300) or None
    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, AGENTS_COLLECTION)
    doc = {
        "id": new_id,
        "owner_id": user.id,
        "name": name,
        "focus": payload.focus,
        "instructions": instructions,
        "search_hint": search_hint,
        "seeded": False,
        "created_at": now,
        "updated_at": now,
    }
    await mongo_db[AGENTS_COLLECTION].insert_one(doc)
    return _agent_to_response(doc)


@router.patch("/agents/{agent_id}", response_model=ResearchAgentResponse)
async def update_research_agent(
    agent_id: int,
    payload: ResearchAgentUpdate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    existing = await mongo_db[AGENTS_COLLECTION].find_one({"id": agent_id, "owner_id": user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Agent not found")

    updates: dict[str, Any] = {"updated_at": datetime.utcnow()}
    if payload.name is not None:
        name = _clip_printable(payload.name, 80)
        if not name:
            raise HTTPException(status_code=400, detail="Agent name is required")
        updates["name"] = name
    if payload.focus is not None:
        updates["focus"] = payload.focus
    if payload.instructions is not None:
        instructions = _clip_printable(payload.instructions, 4000)
        if not instructions:
            raise HTTPException(status_code=400, detail="Agent instructions are required")
        updates["instructions"] = instructions
    if payload.search_hint is not None:
        updates["search_hint"] = _clip_printable(payload.search_hint, 300) or None

    await mongo_db[AGENTS_COLLECTION].update_one(
        {"id": agent_id, "owner_id": user.id},
        {"$set": updates},
    )
    doc = await mongo_db[AGENTS_COLLECTION].find_one({"id": agent_id, "owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agent_to_response(doc)


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_research_agent(
    agent_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    result = await mongo_db[AGENTS_COLLECTION].delete_one({"id": agent_id, "owner_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    await mongo_db[ASSIGNMENTS_COLLECTION].delete_many({"owner_id": user.id, "agent_id": agent_id})
    return Response(status_code=204)


@router.get("/agent-assignments", response_model=list[ResearchAgentAssignmentResponse])
async def list_research_agent_assignments(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
    file_id: int | None = Query(default=None),
    tab_id: str | None = Query(default=None, max_length=120),
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    query: dict[str, Any] = {"owner_id": user.id}
    if file_id is not None:
        query["file_id"] = file_id
    elif tab_id:
        query["tab_id"] = tab_id

    cursor = mongo_db[ASSIGNMENTS_COLLECTION].find(query).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)
    agent_ids = {int(d["agent_id"]) for d in docs if d.get("agent_id") is not None}
    agents_by_id: dict[int, ResearchAgentResponse] = {}
    if agent_ids:
        agent_cursor = mongo_db[AGENTS_COLLECTION].find(
            {"owner_id": user.id, "id": {"$in": list(agent_ids)}}
        )
        for agent_doc in await agent_cursor.to_list(length=100):
            agents_by_id[int(agent_doc["id"])] = _agent_to_response(agent_doc)
    return [
        _assignment_to_response(d, agents_by_id.get(int(d["agent_id"])))
        for d in docs
        if d.get("agent_id") is not None
    ]


@router.post("/agent-assignments", response_model=ResearchAgentAssignmentResponse, status_code=201)
async def assign_research_agent(
    payload: ResearchAgentAssignBody,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    agent = await mongo_db[AGENTS_COLLECTION].find_one(
        {"id": payload.agent_id, "owner_id": user.id}
    )
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    row_indices = sorted({int(i) for i in payload.row_indices if int(i) >= 0})
    if not row_indices:
        raise HTTPException(status_code=400, detail="Select at least one row to assign")

    tab_id = _clip_printable(payload.tab_id, 120) or None
    file_id = payload.file_id
    if file_id is not None and file_id <= 0:
        file_id = None

    match: dict[str, Any] = {
        "owner_id": user.id,
        "agent_id": payload.agent_id,
        "file_id": file_id,
        "tab_id": tab_id,
    }
    existing = await mongo_db[ASSIGNMENTS_COLLECTION].find_one(match)
    now = datetime.utcnow()
    if existing:
        merged = sorted(set(int(i) for i in (existing.get("row_indices") or []) if int(i) >= 0) | set(row_indices))
        await mongo_db[ASSIGNMENTS_COLLECTION].update_one(
            {"id": existing["id"], "owner_id": user.id},
            {"$set": {"row_indices": merged, "updated_at": now, "last_run_at": now}},
        )
        doc = await mongo_db[ASSIGNMENTS_COLLECTION].find_one(
            {"id": existing["id"], "owner_id": user.id}
        )
        if not doc:
            raise HTTPException(status_code=500, detail="Failed to update assignment")
        return _assignment_to_response(doc, _agent_to_response(agent))

    new_id = await get_next_sequence(mongo_db, ASSIGNMENTS_COLLECTION)
    doc = {
        "id": new_id,
        "owner_id": user.id,
        "agent_id": payload.agent_id,
        "file_id": file_id,
        "tab_id": tab_id,
        "row_indices": row_indices,
        "created_at": now,
        "updated_at": now,
        "last_run_at": now,
    }
    await mongo_db[ASSIGNMENTS_COLLECTION].insert_one(doc)
    return _assignment_to_response(doc, _agent_to_response(agent))


@router.delete("/agent-assignments/{assignment_id}", status_code=204)
async def delete_research_agent_assignment(
    assignment_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    result = await mongo_db[ASSIGNMENTS_COLLECTION].delete_one(
        {"id": assignment_id, "owner_id": user.id}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return Response(status_code=204)
