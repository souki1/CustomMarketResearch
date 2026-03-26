from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db
from schemas import CompareStateResponse, CompareStateUpsert

router = APIRouter(prefix="/compare", tags=["compare"])


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


@router.get("/state", response_model=CompareStateResponse | None)
async def get_compare_state(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    doc = await mongo_db["compare_states"].find_one({"owner_id": user.id})
    if not doc:
        return None

    return CompareStateResponse(
        owner_id=doc["owner_id"],
        compare_tabs=doc.get("compare_tabs", []),
        active_compare_tab_id=doc.get("active_compare_tab_id"),
        compare_mode=doc.get("compare_mode", "different-different-vendors"),
        scraped_vendor_filter=doc.get("scraped_vendor_filter", "all"),
        scraped_view_mode=doc.get("scraped_view_mode", "row"),
        scraped_selected_fields=doc.get("scraped_selected_fields", []),
        scraped_value_search=doc.get("scraped_value_search", ""),
        scraped_non_empty_only=doc.get("scraped_non_empty_only", False),
        scraped_data_by_part=doc.get("scraped_data_by_part", {}),
        scraped_data=doc.get("scraped_data", []),
        created_at=doc.get("created_at", datetime.utcnow()),
        updated_at=doc.get("updated_at", datetime.utcnow()),
    )


@router.put("/state", response_model=CompareStateResponse)
async def upsert_compare_state(
    payload: CompareStateUpsert,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    now = datetime.utcnow()
    update_doc = {
        "compare_tabs": payload.compare_tabs,
        "active_compare_tab_id": payload.active_compare_tab_id,
        "compare_mode": payload.compare_mode,
        "scraped_vendor_filter": payload.scraped_vendor_filter,
        "scraped_view_mode": payload.scraped_view_mode,
        "scraped_selected_fields": payload.scraped_selected_fields,
        "scraped_value_search": payload.scraped_value_search,
        "scraped_non_empty_only": payload.scraped_non_empty_only,
        "scraped_data_by_part": payload.scraped_data_by_part,
        "scraped_data": payload.scraped_data,
        "updated_at": now,
    }

    await mongo_db["compare_states"].update_one(
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

    doc = await mongo_db["compare_states"].find_one({"owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=500, detail="Failed to save compare state")

    return CompareStateResponse(
        owner_id=doc["owner_id"],
        compare_tabs=doc.get("compare_tabs", []),
        active_compare_tab_id=doc.get("active_compare_tab_id"),
        compare_mode=doc.get("compare_mode", "different-different-vendors"),
        scraped_vendor_filter=doc.get("scraped_vendor_filter", "all"),
        scraped_view_mode=doc.get("scraped_view_mode", "row"),
        scraped_selected_fields=doc.get("scraped_selected_fields", []),
        scraped_value_search=doc.get("scraped_value_search", ""),
        scraped_non_empty_only=doc.get("scraped_non_empty_only", False),
        scraped_data_by_part=doc.get("scraped_data_by_part", {}),
        scraped_data=doc.get("scraped_data", []),
        created_at=doc.get("created_at", now),
        updated_at=doc.get("updated_at", now),
    )
