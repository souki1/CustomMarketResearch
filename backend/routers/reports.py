from datetime import datetime, timezone
from typing import Annotated

from bson import Binary
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from database import get_db
from models import User
from mongo import get_mongo_db, get_next_sequence
from reports.export import render_docx_bytes, render_pdf_bytes
from schemas import ReportCreate, ReportResponse, ReportUpdate
from workspace_reports_folder import get_or_create_reports_folder_id

router = APIRouter(prefix="/reports", tags=["reports"])


def _normalize_report_doc(doc: dict) -> dict:
    if "workspace_parent_id" not in doc:
        doc["workspace_parent_id"] = None
    return doc


_EXPORT_BLOBS = "report_export_blobs"


def _attachment_filename(title: str, ext: str) -> str:
    base = (title[:80] if title else "report").strip() or "report"
    for ch in '<>:"/\\|?*\x00\r\n':
        base = base.replace(ch, "_")
    return f"{base}.{ext}"


async def _store_export_blob(
    mongo_db: AsyncIOMotorDatabase,
    *,
    report_id: int,
    owner_id: int,
    fmt: str,
    data: bytes,
) -> None:
    now = datetime.now(timezone.utc)
    await mongo_db[_EXPORT_BLOBS].update_one(
        {"report_id": report_id, "owner_id": owner_id, "format": fmt},
        {
            "$set": {
                "data": Binary(data),
                "updated_at": now,
            }
        },
        upsert=True,
    )


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
    reports_folder_id = await get_or_create_reports_folder_id(mongo_db, user.id)

    now = datetime.now(timezone.utc)
    seq_id = await get_next_sequence(mongo_db, "reports")
    doc = {
        "id": seq_id,
        "owner_id": user.id,
        "title": body.title,
        "blocks": body.blocks,
        "workspace_parent_id": reports_folder_id,
        "created_at": now,
        "updated_at": now,
    }
    await mongo_db["reports"].insert_one(doc)
    doc.pop("_id", None)
    return ReportResponse(**_normalize_report_doc(doc))


@router.get("", response_model=list[ReportResponse])
async def list_reports(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    await get_or_create_reports_folder_id(mongo_db, user.id)
    cursor = mongo_db["reports"].find({"owner_id": user.id}).sort("updated_at", -1)
    results: list[dict] = []
    async for doc in cursor:
        doc.pop("_id", None)
        results.append(_normalize_report_doc(doc))
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
    return ReportResponse(**_normalize_report_doc(doc))


@router.put("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: int,
    body: ReportUpdate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    patch = body.model_dump(exclude_unset=True)
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if "title" in patch and patch["title"] is not None:
        updates["title"] = patch["title"]
    if "blocks" in patch and patch["blocks"] is not None:
        updates["blocks"] = patch["blocks"]

    result = await mongo_db["reports"].find_one_and_update(
        {"id": report_id, "owner_id": user.id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Report not found")
    result.pop("_id", None)
    return ReportResponse(**_normalize_report_doc(result))


@router.delete("/{report_id}", status_code=204)
async def delete_report(
    report_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    result = await mongo_db["reports"].delete_one({"id": report_id, "owner_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Report not found")
    await mongo_db[_EXPORT_BLOBS].delete_many({"report_id": report_id, "owner_id": user.id})


@router.get("/{report_id}/export/docx")
async def export_docx(
    report_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    doc = await mongo_db["reports"].find_one({"id": report_id, "owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")

    raw = render_docx_bytes(doc["title"], doc["blocks"])
    await _store_export_blob(
        mongo_db,
        report_id=report_id,
        owner_id=user.id,
        fmt="docx",
        data=raw,
    )
    filename = _attachment_filename(doc["title"], "docx")
    return Response(
        content=raw,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
        raw = render_pdf_bytes(doc["title"], doc["blocks"])
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    await _store_export_blob(
        mongo_db,
        report_id=report_id,
        owner_id=user.id,
        fmt="pdf",
        data=raw,
    )
    filename = _attachment_filename(doc["title"], "pdf")
    return Response(
        content=raw,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
