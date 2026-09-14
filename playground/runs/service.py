"""Run execution: prepare inputs, call the provider, persist metrics."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from playground.config import get_settings
from playground.db import run_db
from playground.models import Batch, PromptVersion, Rating, Run, Video, utcnow
from playground.providers.base import ProviderError, RunCancelled, RunContext, RunResult, word_count
from playground.providers.pricing import api_cost_usd, energy_cost_usd
from playground.providers.registry import get_provider, is_local
from playground.runs.gpu import GpuSampler, GpuStats
from playground.runs.progress import store
from playground.video.frames import ExtractedFrames, FramePlan, extract

log = logging.getLogger("playground.runs")


def _load(session: Session, run_id: int) -> tuple[Run, Video, PromptVersion, Batch]:
    run = session.get(Run, run_id)
    if run is None:
        raise ValueError(f"run {run_id} not found")
    video = session.get(Video, run.video_id)
    pv = session.get(PromptVersion, run.prompt_version_id)
    batch = session.get(Batch, run.batch_id)
    assert video is not None and pv is not None and batch is not None
    session.expunge_all()
    return run, video, pv, batch


def _update(run_id: int, **fields: Any):
    def _inner(session: Session):
        run = session.get(Run, run_id)
        if run is None:
            return None
        for k, v in fields.items():
            setattr(run, k, v)
        run.heartbeat_at = utcnow()
        session.add(run)
        session.commit()
        session.refresh(run)
        session.expunge(run)
        return run

    return run_db(_inner)


def apply_result(
    run: Run,
    result: RunResult,
    gpu: GpuStats | None,
    extract_ms: int | None,
    frames_cache_hit: bool,
) -> None:
    settings = get_settings()
    u = result.usage
    run.output_text = result.text
    run.upload_ms = result.upload_ms
    run.extract_ms = extract_ms
    run.model_load_ms = result.model_load_ms
    run.ttft_ms = result.ttft_ms
    run.model_ms = result.model_ms
    run.total_ms = sum(
        x for x in (result.upload_ms, extract_ms, result.model_load_ms, result.model_ms) if x
    )
    run.cold_start = result.cold_start
    run.cache_hit = result.cache_hit or frames_cache_hit
    run.tokens_in_total = u.in_total
    run.tokens_in_text = u.in_text
    run.tokens_in_image = u.in_image
    run.tokens_in_video = u.in_video
    run.tokens_in_audio = u.in_audio
    run.tokens_in_cached = u.in_cached
    run.tokens_out = u.out
    run.tokens_thinking = u.thinking
    run.truncated_suspected = result.truncated_suspected
    run.frames_sent = result.frames_sent
    run.video_seconds_sent = result.video_seconds_sent
    run.output_chars = len(result.text)
    run.output_words = word_count(result.text)
    if u.out and result.model_ms:
        run.tokens_out_per_s = round(u.out / (result.model_ms / 1000), 2)
    run.cost_api_usd = api_cost_usd(u, run.model_snapshot.get("prices") or {})
    if gpu is not None:
        run.gpu_seconds = gpu.gpu_seconds
        run.gpu_energy_wh = gpu.gpu_energy_wh
        run.gpu_peak_vram_delta_mb = gpu.peak_vram_delta_mb
        run.cost_energy_usd = energy_cost_usd(gpu.gpu_energy_wh, settings.energy_price_per_kwh)
    run.model_vram_mb = result.model_vram_mb
    run.model_version = result.model_version
    run.sdk_versions = result.sdk_versions or None
    run.raw_usage = result.raw_usage or None
    run.request_summary = result.request_summary or None


async def execute_run(run_id: int) -> None:
    from playground.api.serialize import run_payload

    settings = get_settings()
    run, video, pv, batch = await run_db(lambda s: _load(s, run_id))
    rp = store.ensure(run_id, "running")
    rp.text = ""
    store.set_status(run_id, "running", "prepare", "Preparing", batch_id=run.batch_id)
    started = utcnow()
    await _update(run_id, status="running", stage="prepare", started_at=started, error=None)

    frames: ExtractedFrames | None = None
    plan: FramePlan | None = None
    extract_ms: int | None = None
    frames_cache_hit = False
    gpu_stats: GpuStats | None = None
    error: str | None = None
    final_status = "done"

    async def progress(stage: str, message: str) -> None:
        store.set_status(run_id, "running", stage, message, batch_id=run.batch_id)
        await _update(run_id, stage=stage)

    async def delta(text: str) -> None:
        store.append_text(run_id, text)

    try:
        if run.input_mode == "frames":
            if not run.frame_plan:
                raise ProviderError("frames mode without a frame plan")
            fp = run.frame_plan
            plan = FramePlan(
                fps=fp["fps"],
                long_edge=fp["long_edge"],
                max_frames=fp["max_frames"],
                jpeg_quality=fp.get("jpeg_quality", 85),
                preset=run.frame_preset,
            )
            await progress("extract", "Extracting frames")
            frames = await extract(video.path_original, video.sha256, video.duration_s, plan)
            extract_ms, frames_cache_hit = frames.extract_ms, frames.cache_hit
            if frames.count == 0:
                raise ProviderError("no frames extracted")

        ctx = RunContext(
            video=video,
            prompt=pv,
            model=run.model_snapshot,
            input_mode=run.input_mode,
            plan=plan,
            frames=frames,
            progress=progress,
            delta=delta,
            cancel=rp.cancel,
        )
        provider = get_provider(run.provider)
        if is_local(run.provider):
            async with GpuSampler() as sampler:
                result = await asyncio.wait_for(provider.run(ctx), timeout=settings.run_timeout_s)
            gpu_stats = sampler.stats()
        else:
            result = await asyncio.wait_for(provider.run(ctx), timeout=settings.run_timeout_s)

        def _persist(session: Session):
            r = session.get(Run, run_id)
            assert r is not None
            apply_result(r, result, gpu_stats, extract_ms, frames_cache_hit)
            r.status, r.stage, r.finished_at = "done", None, utcnow()
            session.add(r)
            if result.video_cache_update:
                v = session.get(Video, r.video_id)
                if v is not None:
                    for k, val in result.video_cache_update.items():
                        setattr(v, k, val)
                    session.add(v)
            session.commit()

        await run_db(_persist)
    except RunCancelled:
        final_status, error = "cancelled", None
        await _update(run_id, status="cancelled", stage=None, finished_at=utcnow())
    except TimeoutError:
        final_status, error = "error", f"timed out after {settings.run_timeout_s}s"
        await _update(run_id, status="error", stage=None, error=error, finished_at=utcnow())
    except Exception as e:  # noqa: BLE001 - any failure is recorded on the run
        log.exception("run %s failed", run_id)
        final_status, error = "error", f"{type(e).__name__}: {e}"[:2000]
        await _update(run_id, status="error", stage=None, error=error, finished_at=utcnow())

    payload = await run_db(lambda s: run_payload(s, run_id))
    store.set_status(run_id, final_status, None, error or "", batch_id=run.batch_id)
    store.finish(run_id, payload, error)
    # keep partial text available briefly for late subscribers, then drop
    asyncio.get_running_loop().call_later(60, store.forget, run_id)


async def recover_interrupted() -> list[int]:
    """On startup: runs left 'running' become 'interrupted'; 'queued' runs are re-queued."""

    def _inner(session: Session) -> list[int]:
        requeue: list[int] = []
        for run in session.exec(select(Run).where(Run.status.in_(["running", "queued"]))):  # type: ignore[attr-defined]
            if run.status == "running":
                run.status, run.stage, run.error, run.finished_at = (
                    "interrupted",
                    None,
                    "server restarted during run",
                    utcnow(),
                )
                session.add(run)
            else:
                requeue.append(run.id)  # type: ignore[arg-type]
        session.commit()
        return requeue

    return await run_db(_inner)


def rating_for(session: Session, run_id: int, rater: str = "client") -> Rating | None:
    return session.exec(
        select(Rating).where(Rating.run_id == run_id, Rating.rater == rater)
    ).first()


def now_utc() -> datetime:
    return datetime.now(UTC)


__all__ = ["execute_run", "recover_interrupted", "apply_result", "rating_for", "time"]
