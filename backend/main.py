from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.sessions import SessionMiddleware
from config import get_settings, parse_frontend_urls
from database import init_db
from mongo import get_mongo_db
from models import (  # noqa: F401 - register models for create_all
    ApiKey,
    AuditEvent,
    AuthSession,
    CompanyProfile,
    NotificationSettings,
    OAuthExchangeCode,
    User,
)
from routers import ai, auth, compare, datasheet, purchase_orders, reports, research, workspace
from routers import org_settings, security_center
from portfolio.PortfolioApi import router as portfolio_router
from security import SecurityHeadersMiddleware, assert_secure_runtime

settings = get_settings()
_LOCAL_VITE_ORIGINS = (
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
)
_LOCAL_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


def _is_loopback_origin(origin: str) -> bool:
    host = origin.split("://", 1)[-1].split("/")[0].split(":")[0]
    return host in {"localhost", "127.0.0.1"}


_frontend_origin = (settings.frontend_url or "").rstrip("/")
_configured_origins = parse_frontend_urls(_frontend_origin)
_use_local_cors = not _configured_origins or all(_is_loopback_origin(o) for o in _configured_origins)
_cors_origins = list(
    dict.fromkeys(
        [
            *(_configured_origins or []),
            *( _LOCAL_VITE_ORIGINS if _use_local_cors else () ),
        ]
    )
)
_cors_origin_regex = _LOCAL_ORIGIN_REGEX if _use_local_cors else None


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_secure_runtime(
        settings.secret_key,
        is_production=settings.is_production,
        dev_return_otp=settings.dev_return_otp,
    )
    await init_db()
    if settings.mongo_url and settings.mongo_db_name:
        db = get_mongo_db()
        await db["ai_interactions"].create_index([("owner_id", 1), ("session_id", 1), ("created_at", 1)])
        await db["ai_interactions"].create_index([("owner_id", 1), ("created_at", -1)])
        await db["compare_states"].create_index([("owner_id", 1)], unique=True)
        await db["compare_states"].create_index([("updated_at", -1)])
        await db["research_states"].create_index([("owner_id", 1)], unique=True)
        await db["research_states"].create_index([("updated_at", -1)])
        await db["research_jobs"].create_index([("owner_id", 1), ("status", 1), ("updated_at", -1)])
        await db["research_jobs"].create_index([("owner_id", 1), ("file_id", 1), ("status", 1)])
        await db["research_agents"].create_index([("owner_id", 1), ("updated_at", -1)])
        await db["research_agent_seeds"].create_index([("owner_id", 1)], unique=True)
        await db["research_agent_assignments"].create_index(
            [("owner_id", 1), ("file_id", 1), ("tab_id", 1)]
        )
        await db["research_agent_assignments"].create_index([("owner_id", 1), ("agent_id", 1)])
        await db["reports"].create_index([("owner_id", 1), ("updated_at", -1)])
        await db["purchase_orders"].create_index([("owner_id", 1), ("updated_at", -1)])
        await db["portfolio_exclusions"].create_index([("owner_id", 1), ("part_number", 1)])
    yield


_docs = None if settings.is_production and not settings.enable_docs else "/docs"
_redoc = None if settings.is_production and not settings.enable_docs else "/redoc"
_openapi = None if settings.is_production and not settings.enable_docs else "/openapi.json"

app = FastAPI(
    title="InteligentResearch API",
    version="0.2.0",
    lifespan=lifespan,
    docs_url=_docs,
    redoc_url=_redoc,
    openapi_url=_openapi,
)

if settings.allowed_host_list:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_host_list)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    https_only=_frontend_origin.startswith("https://") or settings.is_production,
    max_age=3600 * 24,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(security_center.router)
app.include_router(org_settings.router)
app.include_router(ai.router)
app.include_router(workspace.router)
app.include_router(datasheet.router)
app.include_router(compare.router)
app.include_router(research.router)
app.include_router(reports.router)
app.include_router(purchase_orders.router)
app.include_router(portfolio_router)


@app.get("/")
def root():
    return {"message": "InteligentResearch API", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}
