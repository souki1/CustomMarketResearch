"""REST API for the purchase order board: create, list, update, and delete user-owned POs."""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from mongo import get_mongo_db, get_next_sequence
from routers.auth import get_current_user
from models import User
from schemas import PurchaseOrderCreate, PurchaseOrderResponse, PurchaseOrderUpdate

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])


def _doc_to_response(doc: dict) -> PurchaseOrderResponse:
    d = dict(doc)
    d.pop("_id", None)
    return PurchaseOrderResponse(**d)


@router.post("", response_model=PurchaseOrderResponse, status_code=201)
async def create_purchase_order(
    body: PurchaseOrderCreate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    now = datetime.now(timezone.utc)
    seq_id = await get_next_sequence(mongo_db, "purchase_orders")
    lines = [line.model_dump() for line in body.lines]
    doc = {
        "id": seq_id,
        "owner_id": user.id,
        "number": body.number.strip(),
        "vendor_name": body.vendor_name.strip(),
        "vendor_email": body.vendor_email.strip(),
        "issue_date": body.issue_date.strip(),
        "required_by": body.required_by.strip(),
        "status": body.status,
        "ship_to": body.ship_to.strip(),
        "payment_terms": body.payment_terms.strip(),
        "notes": body.notes.strip(),
        "lines": lines,
        "source_selection_id": body.source_selection_id,
        "created_at": now,
        "updated_at": now,
    }
    await mongo_db["purchase_orders"].insert_one(doc)
    return _doc_to_response(doc)


@router.get("", response_model=list[PurchaseOrderResponse])
async def list_purchase_orders(
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    cursor = mongo_db["purchase_orders"].find({"owner_id": user.id}).sort("updated_at", -1)
    out: list[PurchaseOrderResponse] = []
    async for doc in cursor:
        out.append(_doc_to_response(doc))
    return out


@router.get("/{po_id}", response_model=PurchaseOrderResponse)
async def get_purchase_order(
    po_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    doc = await mongo_db["purchase_orders"].find_one({"id": po_id, "owner_id": user.id})
    if not doc:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return _doc_to_response(doc)


@router.put("/{po_id}", response_model=PurchaseOrderResponse)
async def update_purchase_order(
    po_id: int,
    body: PurchaseOrderUpdate,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.number is not None:
        updates["number"] = body.number.strip()
    if body.vendor_name is not None:
        updates["vendor_name"] = body.vendor_name.strip()
    if body.vendor_email is not None:
        updates["vendor_email"] = body.vendor_email.strip()
    if body.issue_date is not None:
        updates["issue_date"] = body.issue_date.strip()
    if body.required_by is not None:
        updates["required_by"] = body.required_by.strip()
    if body.status is not None:
        updates["status"] = body.status
    if body.ship_to is not None:
        updates["ship_to"] = body.ship_to.strip()
    if body.payment_terms is not None:
        updates["payment_terms"] = body.payment_terms.strip()
    if body.notes is not None:
        updates["notes"] = body.notes.strip()
    if body.lines is not None:
        updates["lines"] = [line.model_dump() for line in body.lines]
    if body.source_selection_id is not None:
        updates["source_selection_id"] = body.source_selection_id

    result = await mongo_db["purchase_orders"].find_one_and_update(
        {"id": po_id, "owner_id": user.id},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    return _doc_to_response(result)


@router.delete("/{po_id}", status_code=204)
async def delete_purchase_order(
    po_id: int,
    user: Annotated[User, Depends(get_current_user)],
    mongo_db: Annotated[AsyncIOMotorDatabase, Depends(get_mongo_db)],
):
    deleted = await mongo_db["purchase_orders"].delete_one({"id": po_id, "owner_id": user.id})
    if deleted.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Purchase order not found")
