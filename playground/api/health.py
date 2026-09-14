from __future__ import annotations

import httpx
from fastapi import APIRouter

from playground.config import get_settings
from playground.runs.gpu import gpu_info

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health():
    settings = get_settings()
    reachable = False
    if settings.ollama_url:
        try:
            async with httpx.AsyncClient(timeout=2) as client:
                reachable = (
                    await client.get(f"{settings.ollama_url.rstrip('/')}/api/version")
                ).status_code == 200
        except httpx.HTTPError:
            reachable = False
    return {
        "status": "ok",
        "host": settings.host_label,
        "gemini_configured": bool(settings.gemini_api_key),
        "ollama_url": settings.ollama_url or None,
        "ollama_reachable": reachable,
        "gpu": gpu_info(),
    }
