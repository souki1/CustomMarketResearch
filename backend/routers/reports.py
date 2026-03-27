from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db, get_next_sequence
from reports.export import generate_docx, generate_pdf
from schemas import ReportCreate, ReportResponse, ReportUpdate

router = APIRouter(prefix="/reports", tags=["reports"])


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


@router.post("", response_model=ReportResponse, status_code=201)
async def create_report(
    body: ReportCreate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    now = datetime.now(timezone.utc)
    seq_id = await get_next_sequence(mongo_db, "reports")
    doc = {
        "id": seq_id,
        "owner_id": user.id,
        "title": body.title,
        "blocks": body.blocks,
        "created_at": now,
        "updated_at": now,
    }
    await mongo_db["reports"].insert_one(doc)
    doc.pop("_id", None)
    return ReportResponse(**doc)


@router.get("", response_model=list[ReportResponse])
async def list_reports(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    cursor = mongo_db["reports"].find({"owner_id": user.id}).sort("updated_at", -1)
    results: list[dict] = []
    async for doc in cursor:
        doc.pop("_id", None)
        results.append(doc)
    return [ReportResponse(**d) for d in results]


@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(
    report_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    doc = await mongo_db["reports"].find_one({"id": report_id, "owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")
    doc.pop("_id", None)
    return ReportResponse(**doc)


@router.put("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: int,
    body: ReportUpdate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.title is not None:
        updates["title"] = body.title
    if body.blocks is not None:
        updates["blocks"] = body.blocks

    result = await mongo_db["reports"].find_one_and_update(
        {"id": report_id, "owner_id": user.id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Report not found")
    result.pop("_id", None)
    return ReportResponse(**result)


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    result = await mongo_db["reports"].delete_one({"id": report_id, "owner_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")


@router.get("/{report_id}/export/docx")
async def export_docx(
    report_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    doc = await mongo_db["reports"].find_one({"id": report_id, "owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    path = generate_docx(doc["title"], doc["blocks"], report_id)
    filename = f"{doc['title'][:80].strip()}.docx"
    return FileResponse(
        path=str(path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )


@router.get("/{report_id}/export/pdf")
async def export_pdf(
    report_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    doc = await mongo_db["reports"].find_one({"id": report_id, "owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    try:
        path = await generate_pdf(doc["title"], doc["blocks"], report_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    filename = f"{doc['title'][:80].strip()}.pdf"
    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=filename,
    )
