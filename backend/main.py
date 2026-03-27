from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from config import get_settings
from database import init_db
from mongo import get_mongo_db
from models import User  # noqa: F401 - register model for create_all
from routers import ai, auth, compare, datasheet, reports, workspace
from portfolio.PortfolioApi import router as portfolio_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if settings.mongo_url and settings.mongo_db_name:
        db = get_mongo_db()
        await db["ai_interactions"].create_index([("owner_id", 1), ("session_id", 1), ("created_at", 1)])
        await db["ai_interactions"].create_index([("owner_id", 1), ("created_at", -1)])
        await db["compare_states"].create_index([("owner_id", 1)], unique=True)
        await db["compare_states"].create_index([("updated_at", -1)])
        await db["reports"].create_index([("owner_id", 1), ("updated_at", -1)])
    yield


app = FastAPI(title="InteligentResearch API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    same_site="lax",
    max_age=3600 * 24,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ai.router)
app.include_router(workspace.router)
app.include_router(datasheet.router)
app.include_router(compare.router)
app.include_router(reports.router)
app.include_router(portfolio_router)


@app.get("/")
def root():
    return {"message": "InteligentResearch API", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}
