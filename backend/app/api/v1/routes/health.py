"""Health check endpoints."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health():
    """Health check for load balancers and monitoring."""
    return {"status": "ok"}
