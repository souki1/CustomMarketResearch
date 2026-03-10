from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db, get_next_sequence
from schemas import DataSheetSelectionCreate, DataSheetSelectionResponse


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

    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, "data_sheet_selections")
    doc = {
        "id": new_id,
        "owner_id": user.id,
        "headers": payload.headers,
        "rows": payload.rows,
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
