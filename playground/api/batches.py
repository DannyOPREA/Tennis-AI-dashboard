from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from playground.api.deps import not_found
from playground.api.serialize import batch_payload, batch_summary, prompt_payload, video_payload
from playground.config import get_settings
from playground.db import run_db
from playground.models import Batch, Prompt, PromptVersion, Rating, Run, Video
from playground.providers.base import RunContext, Usage
from playground.providers.pricing import api_cost_usd
from playground.providers.registry import get_provider
from playground.registry.loader import get_registry
from playground.runs.queue import queue
from playground.video.frames import FramePlan

router = APIRouter(prefix="/api", tags=["batches"])


class Target(BaseModel):
    model_config_id: str
    input_mode: str = "frames"


class EstimateBody(BaseModel):
    video_id: int
    prompt_version_id: int
    targets: list[Target]
    frame_preset: str


class BatchCreate(EstimateBody):
    name: str | None = None
    repeats: int = Field(default=1, ge=1, le=10)
    blind: bool = False


def _validate_targets(targets: list[Target]) -> None:
    reg = get_registry()
    if not targets:
        raise HTTPException(422, "at least one target is required")
    for t in targets:
        try:
            cfg = reg.get_model(t.model_config_id)
        except KeyError as e:
            raise HTTPException(422, str(e)) from e
        if t.input_mode not in cfg.input_modes:
            raise HTTPException(422, f"{cfg.id} does not support input mode {t.input_mode}")


def _load_inputs(session: Session, video_id: int, pv_id: int) -> tuple[Video, PromptVersion]:
    v = session.get(Video, video_id)
    if v is None:
        raise not_found("video", video_id)
    pv = session.get(PromptVersion, pv_id)
    if pv is None:
        raise not_found("prompt version", pv_id)
    session.expunge_all()
    return v, pv


@router.post("/estimate")
async def estimate(body: EstimateBody):
    _validate_targets(body.targets)
    reg = get_registry()
    try:
        preset = reg.get_preset(body.frame_preset)
    except KeyError as e:
        raise HTTPException(422, str(e)) from e
    video, pv = await run_db(lambda s: _load_inputs(s, body.video_id, body.prompt_version_id))
    plan = FramePlan.from_preset(preset)
    out: list[dict[str, Any]] = []
    for t in body.targets:
        cfg = reg.get_model(t.model_config_id)
        snapshot = cfg.to_dict()
        ctx = RunContext(
            video=video,
            prompt=pv,
            model=snapshot,
            input_mode=t.input_mode,
            plan=plan if t.input_mode == "frames" else None,
            frames=None,
        )
        warnings: list[str] = []
        frames = plan.expected_frames(video.duration_s) if t.input_mode == "frames" else 0
        if cfg.max_images and frames > cfg.max_images:
            warnings.append(
                f"model accepts at most {cfg.max_images} images; frames will be truncated"
            )
        exact = False
        provider = get_provider(cfg.provider)
        if t.input_mode == "native_video" and cfg.provider == "gemini" and video.gemini_file_uri:
            tokens, exact = await provider.estimate_tokens(ctx)
        else:
            tokens, exact = await ctx_estimate_fallback(ctx, provider)
        ok, reason = await provider.check_availability(snapshot)
        if not ok and reason:
            warnings.append(reason)
        if cfg.provider != "gemini" and tokens > 60_000:
            warnings.append(f"~{tokens:,} prompt tokens: needs a large num_ctx; watch VRAM")
        max_out = int(cfg.params.get("max_tokens", 4096))
        est_cost = api_cost_usd(Usage(in_total=tokens, out=max_out // 4), cfg.prices) or 0.0
        out.append(
            {
                "model_config_id": cfg.id,
                "input_mode": t.input_mode,
                "frames": frames,
                "est_tokens_in": tokens,
                "est_cost_usd": est_cost,
                "exact": exact,
                "warnings": warnings,
            }
        )
    return out


async def ctx_estimate_fallback(ctx: RunContext, provider):
    if ctx.input_mode == "native_video":
        # ~100 tokens/s at low resolution, ~300 at default; Gemini docs disagree, so use the low figure and mark inexact
        per_s = (
            300
            if str((ctx.model.get("params") or {}).get("media_resolution", "")).endswith("HIGH")
            else 100
        )
        return int(ctx.video.duration_s * per_s) + (
            len(ctx.system_text) + len(ctx.user_text)
        ) // 4, False
    return await provider.estimate_tokens(ctx)


@router.post("/batches", status_code=201)
async def create_batch(body: BatchCreate):
    _validate_targets(body.targets)
    reg = get_registry()
    try:
        preset = reg.get_preset(body.frame_preset)
    except KeyError as e:
        raise HTTPException(422, str(e)) from e
    settings = get_settings()
    plan = FramePlan.from_preset(preset)

    def _create(session: Session):
        video, pv = _load_inputs(session, body.video_id, body.prompt_version_id)
        prompt = session.get(Prompt, pv.prompt_id)
        name = (
            body.name
            or f"{video.title} · {prompt.name if prompt else 'prompt'} v{pv.version} · {datetime.now(UTC):%Y-%m-%d %H:%M}"
        )
        b = Batch(
            name=name[:200],
            video_id=video.id,
            prompt_version_id=pv.id,
            frame_preset=preset.key,
            repeats=body.repeats,
            blind=body.blind,
        )
        session.add(b)
        session.commit()
        session.refresh(b)
        created: list[tuple[int, str]] = []
        for rep in range(body.repeats):
            for t in body.targets:
                cfg = reg.get_model(t.model_config_id)
                run = Run(
                    batch_id=b.id,
                    repeat_index=rep,
                    video_id=video.id,
                    prompt_version_id=pv.id,
                    model_config_id=cfg.id,
                    model_label=cfg.display_name,
                    provider=cfg.provider,
                    model_snapshot=cfg.to_dict(),
                    input_mode=t.input_mode,
                    frame_preset=preset.key,
                    frame_plan=plan.to_dict() if t.input_mode == "frames" else None,
                    frame_plan_hash=plan.hash() if t.input_mode == "frames" else None,
                    host=settings.host_label,
                )
                session.add(run)
                session.commit()
                session.refresh(run)
                created.append((run.id, cfg.provider))
        return b.id, created

    batch_id, created = await run_db(_create)
    for run_id, provider in created:
        queue.submit(run_id, provider, batch_id)
    return await run_db(lambda s: batch_payload(s, s.get(Batch, batch_id)))


@router.get("/batches")
async def list_batches(limit: int = 50):
    return await run_db(
        lambda s: [
            batch_summary(s, b)
            for b in s.exec(select(Batch).order_by(Batch.id.desc()).limit(limit)).all()
        ]
    )  # type: ignore[attr-defined]


@router.get("/batches/{batch_id}")
async def get_batch(batch_id: int):
    def _q(session: Session):
        b = session.get(Batch, batch_id)
        if b is None:
            raise not_found("batch", batch_id)
        return batch_payload(session, b)

    return await run_db(_q)


@router.get("/batches/{batch_id}/export")
async def export_batch(batch_id: int):
    def _q(session: Session):
        b = session.get(Batch, batch_id)
        if b is None:
            raise not_found("batch", batch_id)
        payload = batch_payload(session, b)
        video = session.get(Video, b.video_id)
        pv = session.get(PromptVersion, b.prompt_version_id)
        prompt = session.get(Prompt, pv.prompt_id) if pv else None
        run_ids = [r["id"] for r in payload["runs"]]
        ratings = (
            session.exec(select(Rating).where(Rating.run_id.in_(run_ids))).all() if run_ids else []
        )  # type: ignore[attr-defined]
        return {
            "exported_at": datetime.now(UTC).isoformat(),
            "batch": {k: v for k, v in payload.items() if k != "runs"},
            "video": video_payload(session, video) if video else None,
            "prompt": prompt_payload(session, prompt) if prompt else None,
            "runs": payload["runs"],
            "ratings": [
                {
                    "run_id": r.run_id,
                    "rater": r.rater,
                    "stars": r.stars,
                    "notes": r.notes,
                    "blind": r.blind,
                }
                for r in ratings
            ],
        }

    data = await run_db(_q)
    body = json.dumps(data, indent=2, ensure_ascii=False, default=str)
    return Response(
        body,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="batch-{batch_id}.json"'},
    )
