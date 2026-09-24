from fastapi import APIRouter
from app.core.session_store import session_store

router = APIRouter(tags=["Health"])


@router.get("/health")
@router.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "app": "CleanIQ",
        "version": "1.0.0",
        "active_sessions": len(session_store.list_active_dataset_ids()),
    }
