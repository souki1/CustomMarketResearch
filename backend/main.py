from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from config import assert_secure_runtime, get_settings, parse_frontend_urls
from database import init_db
from mongo import get_mongo_db
from models import User  # noqa: F401 - register model for create_all
from routers import ai, auth, compare, datasheet, purchase_orders, reports, research, workspace
from portfolio.PortfolioApi import router as portfolio_router
from security.headers import SecurityHeadersMiddleware
from security.rate_limit import client_ip, enforce_rate_limit
from starlette.types import ASGIApp, Receive, Scope, Send

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
_enable_hsts = _frontend_origin.startswith("https://") or settings.is_production
_docs_url = "/docs" if (settings.enable_docs and not settings.is_production) else None
_redoc_url = "/redoc" if _docs_url else None
_openapi_url = "/openapi.json" if _docs_url else None


class RequestSizeLimitMiddleware:
    """Reject bodies larger than MAX_REQUEST_BYTES (Content-Length)."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and self.max_bytes > 0:
            headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
            raw = headers.get("content-length")
            if raw:
                try:
                    length = int(raw)
                except ValueError:
                    length = 0
                if length > self.max_bytes:
                    response = JSONResponse({"detail": "Request body too large"}, status_code=413)
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(app: FastAPI):
    assert_secure_runtime(settings)
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
        await db["reports"].create_index([("owner_id", 1), ("updated_at", -1)])
        await db["purchase_orders"].create_index([("owner_id", 1), ("updated_at", -1)])
        await db["portfolio_exclusions"].create_index([("owner_id", 1), ("part_number", 1)])
    yield


app = FastAPI(
    title="InteligentResearch API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)

trusted = [h.strip() for h in (settings.trusted_hosts or "").split(",") if h.strip()]
if trusted:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted)

app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_bytes)
app.add_middleware(SecurityHeadersMiddleware, enable_hsts=_enable_hsts)
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
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)


@app.middleware("http")
async def global_rate_limit(request: Request, call_next):
    if request.url.path in {"/health", "/"} or request.method == "OPTIONS":
        return await call_next(request)
    ip = client_ip(request, trust_proxy=settings.trust_proxy)
    try:
        enforce_rate_limit(f"api:{ip}", settings.api_rate_limit_per_minute, 60)
    except Exception as exc:
        from fastapi import HTTPException

        if isinstance(exc, HTTPException):
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        raise
    return await call_next(request)


app.include_router(auth.router)
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
