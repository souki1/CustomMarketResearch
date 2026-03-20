import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from config import get_settings
from data.groq_client import groq_assistant_chat
from models import User
from mongo import get_mongo_db, get_next_sequence
from routers.auth import get_current_user
from schemas import (
    AiChatHistoryMessage,
    AiChatRequest,
    AiChatResponse,
    AiSessionMessagesResponse,
    AiSessionSummary,
)

router = APIRouter(prefix="/ai", tags=["ai"])

AI_COLLECTION = "ai_interactions"


def _require_mongo_db() -> AsyncIOMotorDatabase:
    settings = get_settings()
    if not settings.mongo_url or not settings.mongo_db_name:
        raise HTTPException(
            status_code=503,
            detail="MongoDB is required for AI. Set MONGO_URL and MONGO_DB_NAME.",
        )
    return get_mongo_db()


async def _assert_session_not_foreign(
    mongo_db: AsyncIOMotorDatabase,
    owner_id: int,
    session_id: str,
) -> None:
    conflict = await mongo_db[AI_COLLECTION].find_one(
        {"session_id": session_id, "owner_id": {"$ne": owner_id}},
    )
    if conflict:
        raise HTTPException(status_code=403, detail="Session is not accessible")


def _preview(text: str, max_len: int = 120) -> str:
    t = (text or "").replace("\n", " ").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


@router.post("/chat", response_model=AiChatResponse)
async def ai_chat(
    body: AiChatRequest,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(_require_mongo_db)],
):
    """
    Groq (Llama) assistant. Persists each turn in MongoDB (`ai_interactions`).
    """
    settings = get_settings()
    if not settings.groq_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI is not configured. Set GROQ_API_KEY on the server.",
        )

    raw_sid = (body.session_id or "").strip() or None
    if raw_sid:
        await _assert_session_not_foreign(mongo_db, user.id, raw_sid)

    if body.mode == "chat":
        session_id = raw_sid or str(uuid.uuid4())
    else:
        session_id = str(uuid.uuid4())

    history = [(m.role, m.content) for m in body.history]
    text = await groq_assistant_chat(
        settings.groq_api_key,
        mode=body.mode,
        user_message=body.message,
        history=history,
        model=settings.groq_model,
    )
    if text is None:
        raise HTTPException(
            status_code=502,
            detail="The AI service did not return a response. Check GROQ_API_KEY and GROQ_MODEL.",
        )

    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, AI_COLLECTION)
    doc = {
        "id": new_id,
        "owner_id": user.id,
        "session_id": session_id,
        "mode": body.mode,
        "user_message": body.message,
        "assistant_message": text,
        "model": settings.groq_model,
        "created_at": now,
    }
    await mongo_db[AI_COLLECTION].insert_one(doc)

    return AiChatResponse(content=text, model=settings.groq_model, session_id=session_id)


@router.get("/sessions", response_model=list[AiSessionSummary])
async def list_ai_sessions(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(_require_mongo_db)],
    mode: Annotated[str | None, Query(description="Filter by mode, e.g. chat")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    """Recent AI threads (one row per `session_id`) stored in MongoDB."""
    match: dict = {"owner_id": user.id}
    if mode:
        match["mode"] = mode

    pipeline: list[dict] = [
        {"$match": match},
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": "$session_id",
                "last_at": {"$first": "$created_at"},
                "preview": {"$first": "$user_message"},
                "mode": {"$first": "$mode"},
                "turn_count": {"$sum": 1},
            }
        },
        {"$sort": {"last_at": -1}},
        {"$limit": limit},
    ]
    cursor = mongo_db[AI_COLLECTION].aggregate(pipeline)
    rows = await cursor.to_list(length=limit)
    return [
        AiSessionSummary(
            session_id=str(r["_id"]),
            mode=str(r["mode"]),
            preview=_preview(str(r.get("preview") or "")),
            last_at=r["last_at"],
            turn_count=int(r["turn_count"]),
        )
        for r in rows
        if r.get("_id")
    ]


@router.get("/sessions/{session_id}/messages", response_model=AiSessionMessagesResponse)
async def get_session_messages(
    session_id: str,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(_require_mongo_db)],
):
    """Load all turns for a session (ordered) to restore chat history."""
    sid = session_id.strip()
    if not sid:
        raise HTTPException(status_code=400, detail="session_id is required")

    cursor = (
        mongo_db[AI_COLLECTION]
        .find({"owner_id": user.id, "session_id": sid})
        .sort([("created_at", 1), ("id", 1)])
    )
    docs = await cursor.to_list(length=500)
    if not docs:
        raise HTTPException(status_code=404, detail="Session not found")

    messages: list[AiChatHistoryMessage] = []
    for d in docs:
        messages.append(AiChatHistoryMessage(role="user", content=d["user_message"]))
        messages.append(AiChatHistoryMessage(role="assistant", content=d["assistant_message"]))

    mode = str(docs[-1].get("mode", "chat"))
    return AiSessionMessagesResponse(session_id=sid, mode=mode, messages=messages)
