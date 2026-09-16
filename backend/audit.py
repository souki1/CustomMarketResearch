from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from models import AuditEvent
from security import client_ip, client_user_agent


async def record_audit(
    db: AsyncSession,
    *,
    user_id: int | None,
    action: str,
    request: Request | None = None,
    detail: str | None = None,
) -> None:
    ip = client_ip(request) if request is not None else None
    user_agent = client_user_agent(request) if request is not None else None
    db.add(
        AuditEvent(
            user_id=user_id,
            action=action[:80],
            ip=ip,
            user_agent=user_agent,
            detail=(detail[:2000] if detail else None),
            created_at=datetime.now(timezone.utc),
        )
    )


OWNER_MONGO_COLLECTIONS = (
    "ai_interactions",
    "compare_states",
    "research_states",
    "research_jobs",
    "research_agents",
    "research_agent_seeds",
    "research_agent_assignments",
    "reports",
    "report_export_blobs",
    "purchase_orders",
    "portfolio_exclusions",
    "workspace_items",
    "workspace_files",
    "data_sheet_selections",
    "research_urls",
    "research_scraped_data",
    "research_cleaned_data",
)


async def purge_user_mongo_data(mongo_db, owner_id: int) -> None:
    if mongo_db is None:
        return
    for name in OWNER_MONGO_COLLECTIONS:
        await mongo_db[name].delete_many({"owner_id": owner_id})
