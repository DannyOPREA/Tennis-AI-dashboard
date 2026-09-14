from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from playground.api.deps import not_found
from playground.api.serialize import rating_payload, run_payload
from playground.db import run_db
from playground.models import Batch, Rating, Run, Video, utcnow
from playground.runs.progress import store
from playground.runs.queue import queue
from playground.video.frames import FramePlan, frames_dir_for

router = APIRouter(prefix="/api", tags=["runs"])


@router.get("/runs")
async def list_runs(
    video_id: int | None = None,
    model_config_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
):
    def _q(session: Session):
        stmt = select(Run).order_by(Run.id.desc()).limit(limit)  # type: ignore[attr-defined]
        if video_id is not None:
            stmt = stmt.where(Run.video_id == video_id)
        if model_config_id:
            stmt = stmt.where(Run.model_config_id == model_config_id)
        if status:
            stmt = stmt.where(Run.status == status)
        return [run_payload(session, r.id) for r in session.exec(stmt).all()]

    return await run_db(_q)


@router.get("/runs/{run_id}")
async def get_run(run_id: int):
    try:
        return await run_db(lambda s: run_payload(s, run_id))
    except KeyError as e:
        raise not_found("run", run_id) from e


@router.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: int):
    run = await run_db(lambda s: s.get(Run, run_id))
    if run is None:
        raise not_found("run", run_id)
    if run.status not in ("queued", "running"):
        raise HTTPException(409, f"run is {run.status}")
    queue.cancel(run_id)
    return await run_db(lambda s: run_payload(s, run_id))


@router.post("/runs/{run_id}/retry", status_code=201)
async def retry_run(run_id: int):
    def _q(session: Session):
        old = session.get(Run, run_id)
        if old is None:
            raise not_found("run", run_id)
        new = Run(
            batch_id=old.batch_id,
            repeat_index=old.repeat_index,
            video_id=old.video_id,
            prompt_version_id=old.prompt_version_id,
            model_config_id=old.model_config_id,
            model_label=old.model_label,
            provider=old.provider,
            model_snapshot=old.model_snapshot,
            input_mode=old.input_mode,
            frame_preset=old.frame_preset,
            frame_plan=old.frame_plan,
            frame_plan_hash=old.frame_plan_hash,
            host=old.host,
            retries=old.retries + 1,
        )
        session.add(new)
        session.commit()
        session.refresh(new)
        return new.id, new.provider, new.batch_id

    new_id, provider, batch_id = await run_db(_q)
    queue.submit(new_id, provider, batch_id)
    return await run_db(lambda s: run_payload(s, new_id))


def _frames_for(run: Run, video: Video):
    if run.input_mode != "frames" or not run.frame_plan:
        return None, []
    fp = run.frame_plan
    plan = FramePlan(
        fps=fp["fps"],
        long_edge=fp["long_edge"],
        max_frames=fp["max_frames"],
        jpeg_quality=fp.get("jpeg_quality", 85),
        preset=run.frame_preset,
    )
    d = frames_dir_for(video.sha256, plan)
    manifest = d / "manifest.json"
    if not manifest.exists():
        return d, []
    data = json.loads(manifest.read_text())
    return d, list(zip(data["files"], data["timestamps"], strict=False))


@router.get("/runs/{run_id}/frames")
async def run_frames(run_id: int):
    def _q(session: Session):
        run = session.get(Run, run_id)
        if run is None:
            raise not_found("run", run_id)
        return run, session.get(Video, run.video_id)

    run, video = await run_db(_q)
    d, items = _frames_for(run, video)
    sheet = d / "contact_sheet.jpg" if d else None
    return {
        "count": len(items),
        "contact_sheet_url": f"/api/runs/{run_id}/contact-sheet"
        if sheet and sheet.exists()
        else None,
        "frames": [
            {"index": i, "t": t, "url": f"/api/runs/{run_id}/frames/{i}"}
            for i, (_, t) in enumerate(items)
        ],
    }


@router.get("/runs/{run_id}/frames/{index}")
async def run_frame(run_id: int, index: int):
    run, video = await run_db(
        lambda s: ((r := s.get(Run, run_id)), s.get(Video, r.video_id) if r else None)
    )
    if run is None:
        raise not_found("run", run_id)
    d, items = _frames_for(run, video)
    if not d or index < 0 or index >= len(items):
        raise not_found("frame", index)
    return FileResponse(d / items[index][0], media_type="image/jpeg")


@router.get("/runs/{run_id}/contact-sheet")
async def contact_sheet(run_id: int):
    run, video = await run_db(
        lambda s: ((r := s.get(Run, run_id)), s.get(Video, r.video_id) if r else None)
    )
    if run is None:
        raise not_found("run", run_id)
    d, _ = _frames_for(run, video)
    if not d or not (d / "contact_sheet.jpg").exists():
        raise not_found("contact sheet", run_id)
    return FileResponse(d / "contact_sheet.jpg", media_type="image/jpeg")


@router.get("/runs/{run_id}/events")
async def run_events(run_id: int, request: Request):
    run = await run_db(lambda s: s.get(Run, run_id))
    if run is None:
        raise not_found("run", run_id)

    async def gen():
        rp, q = store.subscribe(run_id)
        try:
            if rp is not None:
                yield {
                    "event": "status",
                    "data": json.dumps(
                        {"status": rp.status, "stage": rp.stage, "message": rp.message}
                    ),
                }
                if rp.text:
                    yield {"event": "delta", "data": json.dumps({"text": rp.text})}
                if rp.final is not None:
                    yield {"event": "done", "data": json.dumps({"run": rp.final}, default=str)}
                    return
            else:
                payload = await run_db(lambda s: run_payload(s, run_id))
                yield {
                    "event": "status",
                    "data": json.dumps(
                        {"status": payload["status"], "stage": payload["stage"], "message": ""}
                    ),
                }
                if payload["status"] in ("done", "error", "interrupted", "cancelled"):
                    yield {"event": "done", "data": json.dumps({"run": payload}, default=str)}
                    return
                # queued but store lost it (restart): poll until it appears
                while store.get(run_id) is None:
                    if await request.is_disconnected():
                        return
                    await asyncio.sleep(1)
                rp, q = store.subscribe(run_id)
            while True:
                if await request.is_disconnected():
                    return
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=15)
                except TimeoutError:
                    yield {"event": "ping", "data": "{}"}
                    continue
                if event == "__close__":
                    return
                yield {"event": event, "data": json.dumps(data, default=str)}
        finally:
            store.unsubscribe(run_id, q)

    return EventSourceResponse(gen())


@router.get("/events")
async def global_events(request: Request):
    async def gen():
        q = store.subscribe_global()
        try:
            while True:
                if await request.is_disconnected():
                    return
                try:
                    event, data = await asyncio.wait_for(q.get(), timeout=15)
                except TimeoutError:
                    yield {"event": "ping", "data": "{}"}
                    continue
                yield {"event": event, "data": json.dumps(data, default=str)}
        finally:
            store.unsubscribe_global(q)

    return EventSourceResponse(gen())


class RatingBody(BaseModel):
    stars: int = Field(ge=1, le=5)
    notes: str = ""
    rater: str = "client"


@router.put("/runs/{run_id}/rating")
async def put_rating(run_id: int, body: RatingBody):
    def _q(session: Session):
        run = session.get(Run, run_id)
        if run is None:
            raise not_found("run", run_id)
        batch = session.get(Batch, run.batch_id)
        r = session.exec(
            select(Rating).where(Rating.run_id == run_id, Rating.rater == body.rater)
        ).first()
        if r is None:
            r = Rating(
                run_id=run_id,
                rater=body.rater,
                stars=body.stars,
                notes=body.notes,
                blind=bool(batch.blind) if batch else False,
            )
        else:
            r.stars, r.notes, r.updated_at = body.stars, body.notes, utcnow()
        session.add(r)
        session.commit()
        session.refresh(r)
        return rating_payload(r)

    return await run_db(_q)


@router.delete("/runs/{run_id}/rating", status_code=204)
async def delete_rating(run_id: int, rater: str = "client"):
    def _q(session: Session):
        r = session.exec(
            select(Rating).where(Rating.run_id == run_id, Rating.rater == rater)
        ).first()
        if r is None:
            raise not_found("rating", run_id)
        session.delete(r)
        session.commit()

    await run_db(_q)
