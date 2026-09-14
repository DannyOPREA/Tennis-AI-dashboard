"""Settings, first-run status and Ollama model management, all driven from the UI."""

from __future__ import annotations

import os
import shutil
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select
from starlette.concurrency import run_in_threadpool

from playground.api.deps import not_found
from playground.config import APP_VERSION, get_settings, is_frozen, write_env
from playground.db import run_db
from playground.models import Video
from playground.providers.registry import get_provider
from playground.registry.loader import get_registry, reload_registry
from playground.runs.gpu import gpu_info
from playground.runs.pulls import pulls

router = APIRouter(prefix="/api", tags=["settings"])
_last_gemini_test: dict[str, bool | None] = {"ok": None}


def _settings_payload() -> dict:
    s = get_settings()
    key = s.gemini_api_key
    return {
        "gemini_key_set": bool(key),
        "gemini_key_hint": f"…{key[-4:]}" if len(key) >= 8 else None,
        "ollama_url": s.ollama_url,
        "host_name": s.host_name,
        "energy_price_per_kwh": s.energy_price_per_kwh,
        "data_dir": str(s.data_dir),
        "env_file": str(s.env_file),
        "packaged": is_frozen(),
        "version": APP_VERSION,
    }


@router.get("/settings")
async def get_settings_api():
    return _settings_payload()


class SettingsPatch(BaseModel):
    gemini_api_key: str | None = None
    ollama_url: str | None = None
    host_name: str | None = None
    energy_price_per_kwh: float | None = None


@router.put("/settings")
async def put_settings(body: SettingsPatch):
    updates: dict[str, str] = {}
    if body.gemini_api_key is not None:
        updates["GEMINI_API_KEY"] = body.gemini_api_key.strip()
        _last_gemini_test["ok"] = None
    if body.ollama_url is not None:
        url = body.ollama_url.strip().rstrip("/")
        if url and not url.startswith(("http://", "https://")):
            raise HTTPException(422, "ollama_url must start with http:// or https://")
        updates["OLLAMA_URL"] = url
    if body.host_name is not None:
        updates["HOST_NAME"] = body.host_name.strip()
    if body.energy_price_per_kwh is not None:
        if body.energy_price_per_kwh < 0:
            raise HTTPException(422, "energy price must be positive")
        updates["ENERGY_PRICE_PER_KWH"] = str(body.energy_price_per_kwh)
    if updates:
        write_env(updates)
        reload_registry()  # ${OLLAMA_URL} is expanded at load time
    return _settings_payload()


class GeminiTest(BaseModel):
    gemini_api_key: str | None = None


@router.post("/settings/test-gemini")
async def test_gemini(body: GeminiTest):
    key = (body.gemini_api_key or "").strip() or get_settings().gemini_api_key
    if not key:
        return {"ok": False, "message": "No key provided", "models": []}
    from google import genai

    client = genai.Client(api_key=key)
    reachable: list[str] = []
    try:
        resp = await client.aio.models.generate_content(
            model="gemini-3.1-flash-lite", contents="Reply with the single word OK."
        )
        _ = resp.text
        available = {m.name.replace("models/", "") for m in await client.aio.models.list()}
        for cfg in get_registry().models.values():
            if cfg.provider == "gemini" and cfg.model_id in available:
                reachable.append(cfg.id)
        _last_gemini_test["ok"] = True
        return {"ok": True, "message": "Gemini answered", "models": reachable}
    except Exception as e:  # noqa: BLE001
        _last_gemini_test["ok"] = False
        msg = str(e)
        if "API_KEY_INVALID" in msg or "401" in msg or "403" in msg:
            msg = "The key was rejected by Google. Check it was copied completely."
        return {"ok": False, "message": msg[:300], "models": []}


def _disk_free_gb(models_dir: Path) -> float | None:
    probe = models_dir if models_dir.exists() else Path.home()
    try:
        return round(shutil.disk_usage(probe).free / 1e9, 1)
    except OSError:
        return None


async def _ollama_status() -> dict:
    s = get_settings()
    url = s.ollama_url.rstrip("/")
    out: dict = {
        "reachable": False,
        "version": None,
        "url": url,
        "installed": [],
        "disk_free_gb": None,
        "models_dir": None,
    }
    models_dir = Path(os.environ.get("OLLAMA_MODELS") or Path.home() / ".ollama" / "models")
    free = await run_in_threadpool(_disk_free_gb, models_dir)
    out["disk_free_gb"] = free
    out["models_dir"] = str(models_dir)
    if not url:
        return out
    by_tag = {}
    for cfg in get_registry().models.values():
        if cfg.provider == "ollama":
            by_tag[cfg.model_id] = cfg.id
            if ":" not in cfg.model_id:
                by_tag[f"{cfg.model_id}:latest"] = cfg.id
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            v = await client.get(f"{url}/api/version")
            out["version"] = v.json().get("version")
            out["reachable"] = True
            tags = (await client.get(f"{url}/api/tags")).json().get("models") or []
            out["installed"] = [
                {
                    "name": m.get("name"),
                    "size_bytes": int(m.get("size") or 0),
                    "modified_at": m.get("modified_at"),
                    "model_config_id": by_tag.get(m.get("name")),
                }
                for m in tags
            ]
    except (httpx.HTTPError, ValueError):
        out["reachable"] = False
    return out


@router.get("/ollama/status")
async def ollama_status():
    return await _ollama_status()


class PullBody(BaseModel):
    model_config_id: str


def _ollama_cfg(model_config_id: str):
    try:
        cfg = get_registry().get_model(model_config_id)
    except KeyError as e:
        raise not_found("model", model_config_id) from e
    if cfg.provider != "ollama":
        raise HTTPException(422, f"{model_config_id} is not an Ollama model")
    if not cfg.base_url:
        raise HTTPException(503, "Ollama URL is not configured")
    return cfg


@router.post("/ollama/pull", status_code=202)
async def start_pull(body: PullBody):
    cfg = _ollama_cfg(body.model_config_id)
    return pulls.start(cfg.id, cfg.model_id, cfg.base_url).to_dict()


@router.get("/ollama/pulls")
async def list_pulls():
    return [j.to_dict() for j in pulls.jobs.values()]


@router.delete("/ollama/pull/{model_config_id}", status_code=204)
async def cancel_pull(model_config_id: str):
    if not pulls.cancel(model_config_id):
        raise not_found("running pull", model_config_id)


@router.delete("/ollama/models/{model_config_id}", status_code=204)
async def delete_model(model_config_id: str):
    cfg = _ollama_cfg(model_config_id)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.request(
                "DELETE", f"{cfg.base_url.rstrip('/')}/api/delete", json={"model": cfg.model_id}
            )
            if r.status_code == 404:
                raise not_found("installed model", cfg.model_id)
            r.raise_for_status()
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Ollama error: {e}") from e


@router.get("/setup")
async def setup_status():
    s = get_settings()
    status = await _ollama_status()
    local = [c for c in get_registry().models.values() if c.provider == "ollama" and c.enabled]
    available = 0
    for cfg in local:
        ok, _ = await get_provider("ollama").check_availability(cfg.to_dict())
        available += int(ok)
    videos = await run_db(
        lambda sess: int(sess.exec(select(func.count()).select_from(Video)).one())
    )
    gemini_set = bool(s.gemini_api_key)
    return {
        "gemini_key_set": gemini_set,
        "gemini_ok": _last_gemini_test["ok"],
        "ollama_reachable": status["reachable"],
        "ollama_version": status["version"],
        "models_available": available,
        "models_total_local": len(local),
        "videos": videos,
        "gpu": gpu_info(),
        "complete": gemini_set and available >= 1 and videos >= 1,
    }


__all__ = ["router", "Session"]
