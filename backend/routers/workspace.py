from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from models import User, WorkspaceItem
from schemas import WorkspaceItemCreate, WorkspaceItemResponse
from auth_utils import decode_access_token


router = APIRouter(prefix="/workspace", tags=["workspace"])

settings = get_settings()
_BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_DIR = _BACKEND_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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


@router.get("/items", response_model=list[WorkspaceItemResponse])
async def list_items(
    parent_id: int | None = None,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    stmt = select(WorkspaceItem).where(WorkspaceItem.owner_id == user.id)
    if parent_id is None:
        stmt = stmt.where(WorkspaceItem.parent_id.is_(None))
    else:
        stmt = stmt.where(WorkspaceItem.parent_id == parent_id)
    result = await db.execute(stmt.order_by(WorkspaceItem.created_at))
    rows = result.scalars().all()
    # Attach owner display name manually
    return [
        WorkspaceItemResponse(
            id=row.id,
            name=row.name,
            is_folder=row.is_folder,
            parent_id=row.parent_id,
            favorite=row.favorite,
            access=row.access,
            created_at=row.created_at,
            last_opened=row.last_opened,
            owner_display_name=user.display_name,
        )
        for row in rows
    ]


@router.post("/folders", response_model=WorkspaceItemResponse, status_code=201)
async def create_folder(
    payload: WorkspaceItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    item = WorkspaceItem(
        name=payload.name.strip(),
        is_folder=True,
        parent_id=payload.parent_id,
        owner_id=user.id,
        favorite=False,
        access="Edit",
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return WorkspaceItemResponse(
        id=item.id,
        name=item.name,
        is_folder=item.is_folder,
        parent_id=item.parent_id,
        favorite=item.favorite,
        access=item.access,
        created_at=item.created_at,
        last_opened=item.last_opened,
        owner_display_name=user.display_name,
    )


@router.post("/files", response_model=WorkspaceItemResponse, status_code=201)
async def create_file(
    payload: WorkspaceItemCreate,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    item = WorkspaceItem(
        name=payload.name.strip(),
        is_folder=False,
        parent_id=payload.parent_id,
        owner_id=user.id,
        favorite=False,
        access="Edit",
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return WorkspaceItemResponse(
        id=item.id,
        name=item.name,
        is_folder=item.is_folder,
        parent_id=item.parent_id,
        favorite=item.favorite,
        access=item.access,
        created_at=item.created_at,
        last_opened=item.last_opened,
        owner_display_name=user.display_name,
    )


@router.post("/upload-csv", response_model=WorkspaceItemResponse, status_code=201)
async def upload_csv(
    file: UploadFile = File(...),
    parent_id: int | None = Form(None),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".csv"}:
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    safe_name = Path(file.filename).name
    dest = UPLOAD_DIR / safe_name
    # Avoid overwriting existing files
    counter = 1
    while dest.exists():
        dest = UPLOAD_DIR / f"{Path(safe_name).stem}_{counter}{Path(safe_name).suffix}"
        counter += 1

    content = await file.read()
    dest.write_bytes(content)

    item = WorkspaceItem(
        name=safe_name,
        is_folder=False,
        parent_id=parent_id,
        owner_id=user.id,
        favorite=False,
        access="Edit",
        file_path=str(dest),
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)

    return WorkspaceItemResponse(
        id=item.id,
        name=item.name,
        is_folder=item.is_folder,
        parent_id=item.parent_id,
        favorite=item.favorite,
        access=item.access,
        created_at=item.created_at,
        last_opened=item.last_opened,
        owner_display_name=user.display_name,
    )


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    result = await db.execute(
        select(WorkspaceItem).where(
            WorkspaceItem.id == item_id,
            WorkspaceItem.owner_id == user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # If folder, check it has no children
    if item.is_folder:
        child_result = await db.execute(
            select(WorkspaceItem).where(WorkspaceItem.parent_id == item_id)
        )
        if child_result.scalars().first() is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete non-empty folder. Delete or move its contents first.",
            )
    # If file with stored path, remove from disk
    if item.file_path:
        path = Path(item.file_path)
        if path.is_file():
            try:
                path.unlink()
            except OSError:
                pass  # continue with DB delete
    await db.delete(item)


@router.get("/items/{item_id}/content", response_class=PlainTextResponse)
async def get_item_content(
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    result = await db.execute(
        select(WorkspaceItem).where(
            WorkspaceItem.id == item_id,
            WorkspaceItem.owner_id == user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.is_folder:
        raise HTTPException(status_code=400, detail="Folders have no file content")
    if not item.file_path:
        raise HTTPException(status_code=404, detail="File has no content")
    path = Path(item.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found on server")
    try:
        return PlainTextResponse(path.read_text(encoding="utf-8", errors="replace"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read file: {e!s}")

