from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth_utils import decode_access_token
from config import get_settings
from database import get_db
from models import User
from mongo import get_mongo_db, get_next_sequence
from schemas import WorkspaceItemCreate, WorkspaceItemMove, WorkspaceItemResponse


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
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    query: dict = {"owner_id": user.id}
    if parent_id is None:
        query["parent_id"] = None
    else:
        query["parent_id"] = parent_id

    cursor = mongo_db["workspace_items"].find(query).sort("created_at", 1)
    items = await cursor.to_list(length=None)

    results: list[WorkspaceItemResponse] = []
    for doc in items:
        results.append(
            WorkspaceItemResponse(
                id=int(doc["id"]),
                name=doc["name"],
                is_folder=bool(doc["is_folder"]),
                parent_id=doc.get("parent_id"),
                favorite=bool(doc.get("favorite", False)),
                access=str(doc.get("access", "Edit")),
                created_at=doc["created_at"],
                last_opened=doc.get("last_opened"),
                owner_display_name=user.display_name,
            )
        )
    return results


@router.post("/folders", response_model=WorkspaceItemResponse, status_code=201)
async def create_folder(
    payload: WorkspaceItemCreate,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, "workspace_items")
    doc = {
        "id": new_id,
        "name": payload.name.strip(),
        "is_folder": True,
        "parent_id": payload.parent_id,
        "owner_id": user.id,
        "favorite": False,
        "access": "Edit",
        "created_at": now,
        "last_opened": None,
    }
    await mongo_db["workspace_items"].insert_one(doc)

    return WorkspaceItemResponse(
        id=new_id,
        name=doc["name"],
        is_folder=True,
        parent_id=payload.parent_id,
        favorite=False,
        access="Edit",
        created_at=now,
        last_opened=None,
        owner_display_name=user.display_name,
    )


@router.post("/files", response_model=WorkspaceItemResponse, status_code=201)
async def create_file(
    payload: WorkspaceItemCreate,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, "workspace_items")
    doc = {
        "id": new_id,
        "name": payload.name.strip(),
        "is_folder": False,
        "parent_id": payload.parent_id,
        "owner_id": user.id,
        "favorite": False,
        "access": "Edit",
        "created_at": now,
        "last_opened": None,
    }
    await mongo_db["workspace_items"].insert_one(doc)

    return WorkspaceItemResponse(
        id=new_id,
        name=doc["name"],
        is_folder=False,
        parent_id=payload.parent_id,
        favorite=False,
        access="Edit",
        created_at=now,
        last_opened=None,
        owner_display_name=user.display_name,
    )


@router.post("/upload-csv", response_model=WorkspaceItemResponse, status_code=201)
async def upload_csv(
    file: UploadFile = File(...),
    parent_id: int | None = Form(None),
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".csv"}:
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    safe_name = Path(file.filename).name

    now = datetime.utcnow()
    new_id = await get_next_sequence(mongo_db, "workspace_items")
    item_doc = {
        "id": new_id,
        "name": safe_name,
        "is_folder": False,
        "parent_id": parent_id,
        "owner_id": user.id,
        "favorite": False,
        "access": "Edit",
        "created_at": now,
        "last_opened": None,
    }
    await mongo_db["workspace_items"].insert_one(item_doc)

    await mongo_db["workspace_files"].insert_one(
        {
            "workspace_item_id": new_id,
            "owner_id": user.id,
            "filename": safe_name,
            "content_type": file.content_type or "text/csv",
            "size": len(content),
            "content": content,
        }
    )

    return WorkspaceItemResponse(
        id=new_id,
        name=safe_name,
        is_folder=False,
        parent_id=parent_id,
        favorite=False,
        access="Edit",
        created_at=now,
        last_opened=None,
        owner_display_name=user.display_name,
    )


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(
    item_id: int,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    item = await mongo_db["workspace_items"].find_one(
        {"id": item_id, "owner_id": user.id}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    # If folder, check it has no children
    if item["is_folder"]:
        child = await mongo_db["workspace_items"].find_one({"parent_id": item_id})
        if child is not None:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete non-empty folder. Delete or move its contents first.",
            )

    # Remove any associated content stored in MongoDB.
    await mongo_db["workspace_files"].delete_many(
        {"workspace_item_id": item_id, "owner_id": user.id}
    )

    await mongo_db["workspace_items"].delete_one({"id": item_id, "owner_id": user.id})


@router.patch("/items/{item_id}/move", response_model=WorkspaceItemResponse)
async def move_item(
    item_id: int,
    payload: WorkspaceItemMove,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    item = await mongo_db["workspace_items"].find_one(
        {"id": item_id, "owner_id": user.id}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    new_parent_id = payload.parent_id

    if new_parent_id is not None:
        parent = await mongo_db["workspace_items"].find_one(
            {"id": new_parent_id, "owner_id": user.id}
        )
        if not parent or not parent.get("is_folder"):
            raise HTTPException(status_code=400, detail="Target folder not found")

    await mongo_db["workspace_items"].update_one(
        {"id": item_id, "owner_id": user.id},
        {"$set": {"parent_id": new_parent_id}},
    )

    updated = await mongo_db["workspace_items"].find_one(
        {"id": item_id, "owner_id": user.id}
    )
    assert updated is not None

    return WorkspaceItemResponse(
        id=int(updated["id"]),
        name=str(updated["name"]),
        is_folder=bool(updated["is_folder"]),
        parent_id=updated.get("parent_id"),
        favorite=bool(updated.get("favorite", False)),
        access=str(updated.get("access", "Edit")),
        created_at=updated["created_at"],
        last_opened=updated.get("last_opened"),
        owner_display_name=user.display_name,
    )

@router.get("/items/{item_id}/content", response_class=PlainTextResponse)
async def get_item_content(
    item_id: int,
    user: Annotated[User, Depends(get_current_user)] = None,
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)] = None,
):
    if mongo_db is None:
        raise HTTPException(status_code=500, detail="MongoDB is not configured")

    item = await mongo_db["workspace_items"].find_one(
        {"id": item_id, "owner_id": user.id}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item["is_folder"]:
        raise HTTPException(status_code=400, detail="Folders have no file content")

    doc = await mongo_db["workspace_files"].find_one(
        {"workspace_item_id": item_id, "owner_id": user.id}
    )
    if not doc or "content" not in doc:
        raise HTTPException(status_code=404, detail="File has no content")

    try:
        text = doc["content"].decode("utf-8", errors="replace")
        return PlainTextResponse(text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cannot read file: {e!s}")

