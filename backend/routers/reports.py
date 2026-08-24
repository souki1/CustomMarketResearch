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
from reports.docx_import import create_linked_report_from_docx
from schemas import ReportCreate, ReportResponse, ReportUpdate
from workspace_reports_folder import get_or_create_reports_folder_id

router = APIRouter(prefix="/reports", tags=["reports"])


def _normalize_report_doc(doc: dict) -> dict:
    if "workspace_parent_id" not in doc:
        doc["workspace_parent_id"] = None
    if "source_workspace_file_id" not in doc:
        legacy = doc.get("source_workspace_pdf_id")
        doc["source_workspace_file_id"] = legacy
    if "source_workspace_pdf_id" not in doc:
        doc["source_workspace_pdf_id"] = None
    return doc


_EXPORT_BLOBS = "report_export_blobs"


def _attachment_filename(title: str, ext: str) -> str:
    """ASCII-only download name — HTTP Content-Disposition is latin-1."""
    base = (title[:80] if title else "report").strip() or "report"
    for src, dst in (
        ("\u2014", "-"),
        ("\u2013", "-"),
        ("\u2012", "-"),
        ("\u2212", "-"),
        ("\u00a0", " "),
    ):
        base = base.replace(src, dst)
    for ch in '<>:"/\\|?*\x00\r\n':
        base = base.replace(ch, "_")
    base = "".join(c if ord(c) < 128 else "_" for c in base)
    base = base.strip(" ._") or "report"
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


@router.post("/import-from-docx/{workspace_item_id}", response_model=ReportResponse)
async def import_from_docx(
    workspace_item_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    """Ensure a workspace Word file has a linked editable report."""
    item = await mongo_db["workspace_items"].find_one(
        {"id": workspace_item_id, "owner_id": user.id}
    )
    if not item or item.get("is_folder"):
        raise HTTPException(status_code=404, detail="Word file not found")
    if str(item.get("access")) != "Report":
        raise HTTPException(status_code=400, detail="Not a report Word file")

    existing_report_id = item.get("report_id")
    if existing_report_id is not None:
        doc = await mongo_db["reports"].find_one(
            {"id": int(existing_report_id), "owner_id": user.id}
        )
        if doc:
            doc.pop("_id", None)
            return ReportResponse(**_normalize_report_doc(doc))

    file_doc = await mongo_db["workspace_files"].find_one(
        {"workspace_item_id": workspace_item_id, "owner_id": user.id}
    )
    if not file_doc or "content" not in file_doc:
        raise HTTPException(status_code=404, detail="Document content not found")

    content = file_doc["content"]
    if isinstance(content, str):
        content = content.encode("utf-8")

    reports_folder_id = await get_or_create_reports_folder_id(mongo_db, user.id)
    report_doc = await create_linked_report_from_docx(
        mongo_db,
        owner_id=user.id,
        reports_folder_id=reports_folder_id,
        workspace_item_id=workspace_item_id,
        filename=str(item.get("name") or "document.docx"),
        content=content,
    )
    report_doc.pop("_id", None)
    return ReportResponse(**_normalize_report_doc(report_doc))


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
    linked_items = await mongo_db["workspace_items"].find(
        {"owner_id": user.id, "report_id": report_id}
    ).to_list(length=100)
    linked_ids = [int(x["id"]) for x in linked_items]
    if linked_ids:
        await mongo_db["workspace_files"].delete_many(
            {"owner_id": user.id, "workspace_item_id": {"$in": linked_ids}}
        )
        await mongo_db["workspace_items"].delete_many(
            {"owner_id": user.id, "id": {"$in": linked_ids}}
        )


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
