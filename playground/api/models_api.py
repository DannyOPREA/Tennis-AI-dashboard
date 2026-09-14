from __future__ import annotations

import asyncio

from fastapi import APIRouter

from playground.providers.registry import get_provider
from playground.registry.loader import get_registry, reload_registry
from playground.runs.pulls import pulls

router = APIRouter(prefix="/api", tags=["models"])


async def _with_availability(models):
    async def one(cfg):
        d = cfg.to_dict()
        if not cfg.enabled:
            d["availability"] = {"available": False, "reason": "disabled in models.yaml"}
            return d
        if pulls.is_pulling(cfg.id):
            d["availability"] = {"available": False, "reason": "downloading"}
            return d
        try:
            ok, reason = await get_provider(cfg.provider).check_availability(d)
        except KeyError:
            ok, reason = False, f"unknown provider {cfg.provider}"
        d["availability"] = {"available": ok, "reason": reason}
        return d

    return await asyncio.gather(*(one(c) for c in models))


@router.get("/models")
async def list_models():
    return await _with_availability(list(get_registry().models.values()))


@router.post("/models/reload")
async def reload_models():
    return await _with_availability(list(reload_registry().models.values()))


@router.get("/frame-presets")
async def frame_presets():
    return [p.to_dict() for p in get_registry().presets.values()]
