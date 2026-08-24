"""
Ensures each user has a root-level workspace folder for saved reports.

All report documents use workspace_parent_id pointing at this folder.
"""

from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from mongo import get_next_sequence

REPORTS_FOLDER_NAME = "Reports"


async def get_or_create_reports_folder_id(mongo_db: AsyncIOMotorDatabase, owner_id: int) -> int:
    doc = await mongo_db["workspace_items"].find_one(
        {
            "owner_id": owner_id,
            "parent_id": None,
            "is_folder": True,
            "is_reports_folder": True,
        }
    )
    if doc:
        folder_id = int(doc["id"])
    else:
        now = datetime.utcnow()
        new_id = await get_next_sequence(mongo_db, "workspace_items")
        await mongo_db["workspace_items"].insert_one(
            {
                "id": new_id,
                "name": REPORTS_FOLDER_NAME,
                "is_folder": True,
                "parent_id": None,
                "owner_id": owner_id,
                "favorite": False,
                "access": "Edit",
                "created_at": now,
                "last_opened": None,
                "is_reports_folder": True,
            }
        )
        folder_id = new_id

    # Every saved report belongs in this folder (single place in the file tree).
    await mongo_db["reports"].update_many(
        {"owner_id": owner_id},
        {"$set": {"workspace_parent_id": folder_id}},
    )

    return folder_id
