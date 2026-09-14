"""FastAPI application: API under /api, built frontend served from frontend/dist."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from playground.api import (
    batches,
    dashboard,
    health,
    models_api,
    prompts,
    runs,
    settings_api,
    videos,
)
from playground.config import get_settings
from playground.db import init_db, session_scope
from playground.prompts.seed import seed_prompts
from playground.registry.loader import get_registry
from playground.runs.queue import queue
from playground.runs.service import recover_interrupted

log = logging.getLogger("playground")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    settings.ensure_dirs()
    init_db()
    with session_scope() as s:
        n = seed_prompts(s)
        if n:
            log.info("seeded %d prompts", n)
    get_registry()
    await queue.start()
    from playground.db import run_db
    from playground.models import Run

    requeue = await recover_interrupted()
    for run_id in requeue:
        provider, batch_id = await run_db(
            lambda s, rid=run_id: ((r := s.get(Run, rid)).provider, r.batch_id)
        )
        queue.submit(run_id, provider, batch_id)
    log.info(
        "playground ready on http://%s:%s (host label %s)",
        settings.bind_host,
        settings.port,
        settings.host_label,
    )
    try:
        yield
    finally:
        await queue.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Tennis AI Playground", version="0.1.0", lifespan=lifespan)
    for r in (
        health.router,
        videos.router,
        prompts.router,
        models_api.router,
        batches.router,
        runs.router,
        dashboard.router,
        settings_api.router,
    ):
        app.include_router(r)

    @app.exception_handler(KeyError)
    async def _key_error(_req, exc: KeyError):
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    dist = settings.frontend_dist
    index = dist / "index.html"
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = dist / path
        if path and candidate.is_file() and candidate.resolve().is_relative_to(dist.resolve()):
            return FileResponse(candidate)
        if index.exists():
            return FileResponse(index)
        return JSONResponse(
            {"detail": "frontend not built: run `npm run build` in frontend/"}, status_code=503
        )

    return app


app = create_app()
