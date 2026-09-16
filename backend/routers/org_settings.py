from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from audit import record_audit
from database import get_db
from deps import get_current_user
from models import CompanyProfile, NotificationSettings, User
from schemas import (
    CompanyProfileBody,
    CompanyProfileResponse,
    NotificationSettingsBody,
    NotificationSettingsResponse,
)
from security import assert_safe_image_bytes

router = APIRouter(prefix="/settings", tags=["settings"])

ALLOWED_CURRENCIES = {"USD", "EUR", "GBP"}
ALLOWED_TIMEZONES = {"America/New_York", "Europe/London", "Asia/Dubai"}


def _company_response(row: CompanyProfile | None) -> CompanyProfileResponse:
    if row is None:
        return CompanyProfileResponse(has_logo=False, updated_at=None)
    return CompanyProfileResponse(
        company_name=row.company_name,
        industry=row.industry,
        tax_id=row.tax_id,
        website=row.website,
        annual_volume=row.annual_volume,
        currency=row.currency,
        timezone=row.timezone,
        billing_address=row.billing_address,
        shipping_address=row.shipping_address,
        has_logo=bool(row.logo_data),
        updated_at=row.updated_at,
    )


def _notification_response(row: NotificationSettings | None) -> NotificationSettingsResponse:
    if row is None:
        return NotificationSettingsResponse()
    return NotificationSettingsResponse(
        price_drop_alerts=row.price_drop_alerts,
        stock_alerts=row.stock_alerts,
        rfq_alerts=row.rfq_alerts,
        weekly_spend_report=row.weekly_spend_report,
        delivery_email=row.delivery_email,
        delivery_sms=row.delivery_sms,
        updated_at=row.updated_at,
    )


async def _get_or_create_company(db: AsyncSession, user_id: int) -> CompanyProfile:
    result = await db.execute(select(CompanyProfile).where(CompanyProfile.user_id == user_id))
    row = result.scalar_one_or_none()
    if row:
        return row
    row = CompanyProfile(user_id=user_id)
    db.add(row)
    await db.flush()
    return row


async def _get_or_create_notifications(db: AsyncSession, user_id: int) -> NotificationSettings:
    result = await db.execute(select(NotificationSettings).where(NotificationSettings.user_id == user_id))
    row = result.scalar_one_or_none()
    if row:
        return row
    row = NotificationSettings(user_id=user_id)
    db.add(row)
    await db.flush()
    return row


@router.get("/company", response_model=CompanyProfileResponse)
async def get_company(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
    return _company_response(result.scalar_one_or_none())


@router.put("/company", response_model=CompanyProfileResponse)
async def update_company(
    body: CompanyProfileBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    row = await _get_or_create_company(db, user.id)
    if body.currency is not None and body.currency not in ALLOWED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Unsupported currency")
    if body.timezone is not None and body.timezone not in ALLOWED_TIMEZONES:
        raise HTTPException(status_code=400, detail="Unsupported timezone")
    if body.website is not None:
        website = body.website.strip()
        if website and not website.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Website must start with http:// or https://")
        row.website = website or None
    if body.company_name is not None:
        row.company_name = body.company_name.strip() or None
    if body.industry is not None:
        row.industry = body.industry.strip() or None
    if body.tax_id is not None:
        row.tax_id = body.tax_id.strip() or None
    if body.annual_volume is not None:
        row.annual_volume = body.annual_volume.strip() or None
    if body.currency is not None:
        row.currency = body.currency
    if body.timezone is not None:
        row.timezone = body.timezone
    if body.billing_address is not None:
        row.billing_address = body.billing_address.strip() or None
    if body.shipping_address is not None:
        row.shipping_address = body.shipping_address.strip() or None
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(db, user_id=user.id, action="company_update", request=request)
    return _company_response(row)


@router.post("/company/logo", response_model=CompanyProfileResponse)
async def upload_company_logo(
    request: Request,
    file: UploadFile = File(...),
    db: Annotated[AsyncSession, Depends(get_db)] = None,
    user: Annotated[User, Depends(get_current_user)] = None,
):
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo too large (max 2MB)")
    sniffed = assert_safe_image_bytes(content)
    row = await _get_or_create_company(db, user.id)
    row.logo_content_type = sniffed
    row.logo_data = content
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(db, user_id=user.id, action="company_logo_update", request=request)
    return _company_response(row)


@router.get("/company/logo")
async def get_company_logo(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(CompanyProfile).where(CompanyProfile.user_id == user.id))
    row = result.scalar_one_or_none()
    if not row or not row.logo_data:
        raise HTTPException(status_code=404, detail="No logo uploaded")
    return Response(
        content=row.logo_data,
        media_type=row.logo_content_type or "image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/notifications", response_model=NotificationSettingsResponse)
async def get_notifications(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    result = await db.execute(select(NotificationSettings).where(NotificationSettings.user_id == user.id))
    return _notification_response(result.scalar_one_or_none())


@router.put("/notifications", response_model=NotificationSettingsResponse)
async def update_notifications(
    body: NotificationSettingsBody,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    row = await _get_or_create_notifications(db, user.id)
    row.price_drop_alerts = body.price_drop_alerts
    row.stock_alerts = body.stock_alerts
    row.rfq_alerts = body.rfq_alerts
    row.weekly_spend_report = body.weekly_spend_report
    row.delivery_email = body.delivery_email
    row.delivery_sms = body.delivery_sms
    row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await record_audit(db, user_id=user.id, action="notifications_update", request=request)
    return _notification_response(row)
