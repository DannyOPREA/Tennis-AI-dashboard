from __future__ import annotations

from statistics import median
from typing import Any

from fastapi import APIRouter
from sqlmodel import Session, select

from playground.db import run_db
from playground.models import Batch, Prompt, PromptVersion, Rating, Run, Video

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _mean(vals: list[float]) -> float | None:
    return round(sum(vals) / len(vals), 4) if vals else None


def _median(vals: list[float]) -> float | None:
    return round(median(vals), 2) if vals else None


def _filtered_runs(
    session: Session, prompt_id, video_id, host, frame_preset, include_cold, rater
) -> list[tuple[Run, Rating | None]]:
    stmt = select(Run).where(Run.status == "done")
    if video_id is not None:
        stmt = stmt.where(Run.video_id == video_id)
    if host:
        stmt = stmt.where(Run.host == host)
    if frame_preset:
        stmt = stmt.where(Run.frame_preset == frame_preset)
    if prompt_id is not None:
        pv_ids = [
            pv.id
            for pv in session.exec(
                select(PromptVersion).where(PromptVersion.prompt_id == prompt_id)
            ).all()
        ]
        stmt = stmt.where(Run.prompt_version_id.in_(pv_ids))  # type: ignore[attr-defined]
    runs = list(session.exec(stmt).all())
    if not include_cold:
        runs = [r for r in runs if not r.cold_start]
    ratings = {r.run_id: r for r in session.exec(select(Rating).where(Rating.rater == rater)).all()}
    return [(r, ratings.get(r.id)) for r in runs]


@router.get("/filters")
async def filters():
    def _q(session: Session):
        prompts = [
            {"id": p.id, "name": p.name}
            for p in session.exec(select(Prompt).order_by(Prompt.name)).all()
        ]
        videos = [
            {"id": v.id, "title": v.title}
            for v in session.exec(select(Video).order_by(Video.title)).all()
        ]
        hosts = sorted({h for h in session.exec(select(Run.host).distinct()).all() if h})
        presets = sorted({p for p in session.exec(select(Run.frame_preset).distinct()).all() if p})
        models = sorted(
            {
                (r.model_config_id, r.model_label)
                for r in session.exec(select(Run.model_config_id, Run.model_label).distinct()).all()
            }
        )
        return {
            "prompts": prompts,
            "videos": videos,
            "hosts": hosts,
            "presets": presets,
            "models": [{"id": i, "display_name": n} for i, n in models],
        }

    return await run_db(_q)


@router.get("/summary")
async def summary(
    prompt_id: int | None = None,
    video_id: int | None = None,
    host: str | None = None,
    frame_preset: str | None = None,
    include_cold: bool = False,
    rater: str = "client",
):
    def _q(session: Session):
        rows: dict[str, dict[str, Any]] = {}
        groups: dict[str, list[tuple[Run, Rating | None]]] = {}
        for run, rating in _filtered_runs(
            session, prompt_id, video_id, host, frame_preset, include_cold, rater
        ):
            key = f"{run.model_config_id}|{run.input_mode}|{run.frame_preset}"
            groups.setdefault(key, []).append((run, rating))
        # errors and truncation counts come from all runs (not only done) in the same groups
        err_stmt = select(Run).where(Run.status == "error")
        errors: dict[str, int] = {}
        for r in session.exec(err_stmt).all():
            errors[f"{r.model_config_id}|{r.input_mode}|{r.frame_preset}"] = (
                errors.get(f"{r.model_config_id}|{r.input_mode}|{r.frame_preset}", 0) + 1
            )
        for key, items in groups.items():
            runs = [r for r, _ in items]
            stars = [float(rt.stars) for _, rt in items if rt]
            first = runs[0]
            rows[key] = {
                "key": key,
                "model_config_id": first.model_config_id,
                "display_name": first.model_label,
                "provider": first.provider,
                "input_mode": first.input_mode,
                "frame_preset": first.frame_preset,
                "n": len(runs),
                "n_rated": len(stars),
                "stars_mean": _mean(stars),
                "stars_min": min(stars) if stars else None,
                "stars_max": max(stars) if stars else None,
                "model_ms_median": _median([r.model_ms for r in runs if r.model_ms is not None]),
                "model_ms_min": min(
                    (r.model_ms for r in runs if r.model_ms is not None), default=None
                ),
                "model_ms_max": max(
                    (r.model_ms for r in runs if r.model_ms is not None), default=None
                ),
                "ttft_ms_median": _median([r.ttft_ms for r in runs if r.ttft_ms is not None]),
                "total_ms_median": _median([r.total_ms for r in runs if r.total_ms is not None]),
                "tokens_in_mean": _mean(
                    [r.tokens_in_total for r in runs if r.tokens_in_total is not None]
                ),
                "tokens_out_mean": _mean([r.tokens_out for r in runs if r.tokens_out is not None]),
                "tokens_thinking_mean": _mean(
                    [r.tokens_thinking for r in runs if r.tokens_thinking is not None]
                ),
                "tokens_out_per_s_mean": _mean(
                    [r.tokens_out_per_s for r in runs if r.tokens_out_per_s is not None]
                ),
                "cost_api_usd_mean": _mean(
                    [r.cost_api_usd for r in runs if r.cost_api_usd is not None]
                ),
                "cost_api_usd_total": round(
                    sum(r.cost_api_usd for r in runs if r.cost_api_usd is not None), 6
                ),
                "cost_energy_usd_mean": _mean(
                    [r.cost_energy_usd for r in runs if r.cost_energy_usd is not None]
                ),
                "gpu_peak_vram_delta_mb_max": max(
                    (
                        r.gpu_peak_vram_delta_mb
                        for r in runs
                        if r.gpu_peak_vram_delta_mb is not None
                    ),
                    default=None,
                ),
                "model_vram_mb": next((r.model_vram_mb for r in runs if r.model_vram_mb), None),
                "truncated_count": sum(1 for r in runs if r.truncated_suspected),
                "error_count": errors.get(key, 0),
            }
        return sorted(rows.values(), key=lambda r: (-(r["stars_mean"] or 0), r["display_name"]))

    return await run_db(_q)


@router.get("/runs")
async def points(
    prompt_id: int | None = None,
    video_id: int | None = None,
    host: str | None = None,
    frame_preset: str | None = None,
    include_cold: bool = False,
    rater: str = "client",
):
    def _q(session: Session):
        out = []
        for run, rating in _filtered_runs(
            session, prompt_id, video_id, host, frame_preset, include_cold, rater
        ):
            out.append(
                {
                    "run_id": run.id,
                    "batch_id": run.batch_id,
                    "model_config_id": run.model_config_id,
                    "display_name": run.model_label,
                    "provider": run.provider,
                    "input_mode": run.input_mode,
                    "frame_preset": run.frame_preset,
                    "video_id": run.video_id,
                    "stars": rating.stars if rating else None,
                    "cost_api_usd": run.cost_api_usd,
                    "model_ms": run.model_ms,
                    "ttft_ms": run.ttft_ms,
                    "tokens_in_total": run.tokens_in_total,
                    "tokens_out": run.tokens_out,
                    "cold_start": run.cold_start,
                }
            )
        return out

    return await run_db(_q)


__all__ = ["router", "Batch"]
