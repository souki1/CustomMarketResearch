from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ReturnDocument

from config import get_settings


@lru_cache
def _get_mongo_client() -> AsyncIOMotorClient:
    settings = get_settings()
    if not settings.mongo_url:
        raise RuntimeError("MONGO_URL is not configured")
    return AsyncIOMotorClient(settings.mongo_url)


def get_mongo_db() -> AsyncIOMotorDatabase:
    """
    FastAPI dependency/utility that returns the configured MongoDB database.
    Usage in routes:

        from fastapi import Depends
        from motor.motor_asyncio import AsyncIOMotorDatabase
        from mongo import get_mongo_db

        @router.get("/something")
        async def handler(db: AsyncIOMotorDatabase = Depends(get_mongo_db)):
            ...
    """

    settings = get_settings()
    if not settings.mongo_db_name:
        raise RuntimeError("MONGO_DB_NAME is not configured")
    client = _get_mongo_client()
    return client[settings.mongo_db_name]


async def get_next_sequence(db: AsyncIOMotorDatabase, name: str) -> int:
    """
    Atomically increment and return an integer sequence value stored in MongoDB.
    Used to generate numeric IDs for workspace items so the frontend can keep
    using 'id: number'.
    """

    doc = await db["counters"].find_one_and_update(
        {"_id": name},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["seq"])

