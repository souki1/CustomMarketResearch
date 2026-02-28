"""FastAPI application entry point."""

from fastapi import FastAPI

from app.config import settings
from app.api.v1.routes import health

app = FastAPI(
    title=settings.app_name,
    debug=settings.debug,
)

app.include_router(health.router, prefix="/api/v1", tags=["health"])


@app.get("/")
def root():
    """Root endpoint."""
    return {"message": "InteligentResearch API", "docs": "/docs"}
