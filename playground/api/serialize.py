"""Build the JSON payloads described in docs/api-contract.md."""

from __future__ import annotations

from typing import Any

from sqlmodel import Session, func, select

from playground.models import METRIC_FIELDS, Batch, Prompt, PromptVersion, Rating, Run, Video


def _iso(dt) -> str | None:
    return dt.isoformat() + "Z" if dt is not None else None


def video_payload(session: Session, v: Video) -> dict[str, Any]:
    count = session.exec(select(func.count()).select_from(Run).where(Run.video_id == v.id)).one()
    return {
        "id": v.id,
        "title": v.title,
        "filename": v.filename,
        "sha256": v.sha256,
        "duration_s": round(v.duration_s, 2),
        "fps": round(v.fps, 3),
        "width": v.width,
        "height": v.height,
        "size_bytes": v.size_bytes,
        "has_audio": v.has_audio,
        "tags": list(v.tags or []),
        "uploaded_at": _iso(v.uploaded_at),
        "thumbnail_url": f"/api/videos/{v.id}/thumbnail",
        "file_url": f"/api/videos/{v.id}/file",
        "run_count": int(count),
    }


def prompt_payload(session: Session, p: Prompt) -> dict[str, Any]:
    versions = session.exec(
        select(PromptVersion).where(PromptVersion.prompt_id == p.id).order_by(PromptVersion.version)
    ).all()
    out_versions = []
    for pv in versions:
        rc = session.exec(
            select(func.count()).select_from(Run).where(Run.prompt_version_id == pv.id)
        ).one()
        out_versions.append(
            {
                "id": pv.id,
                "prompt_id": pv.prompt_id,
                "version": pv.version,
                "system_text": pv.system_text,
                "user_text": pv.user_text,
                "output_language": pv.output_language,
                "created_at": _iso(pv.created_at),
                "run_count": int(rc),
            }
        )
    return {
        "id": p.id,
        "name": p.name,
        "notes": p.notes,
        "created_at": _iso(p.created_at),
        "versions": out_versions,
        "latest_version_id": out_versions[-1]["id"] if out_versions else None,
    }


def rating_payload(r: Rating) -> dict[str, Any]:
    return {
        "id": r.id,
        "run_id": r.run_id,
        "rater": r.rater,
        "stars": r.stars,
        "notes": r.notes,
        "blind": r.blind,
        "created_at": _iso(r.created_at),
        "updated_at": _iso(r.updated_at),
    }


def run_to_dict(
    run: Run,
    video: Video | None,
    pv: PromptVersion | None,
    prompt: Prompt | None,
    rating: Rating | None,
    blind: bool,
) -> dict[str, Any]:
    metrics = {k: getattr(run, k) for k in METRIC_FIELDS}
    return {
        "id": run.id,
        "batch_id": run.batch_id,
        "repeat_index": run.repeat_index,
        "video_id": run.video_id,
        "prompt_version_id": run.prompt_version_id,
        "model_config_id": run.model_config_id,
        "model_label": run.model_label,
        "provider": run.provider,
        "model_snapshot": run.model_snapshot,
        "input_mode": run.input_mode,
        "frame_preset": run.frame_preset,
        "frame_plan": run.frame_plan,
        "frame_plan_hash": run.frame_plan_hash,
        "host": run.host,
        "status": run.status,
        "stage": run.stage,
        "created_at": _iso(run.created_at),
        "started_at": _iso(run.started_at),
        "finished_at": _iso(run.finished_at),
        "output_text": run.output_text,
        "error": run.error,
        "retries": run.retries,
        "metrics": metrics,
        "raw_usage": run.raw_usage,
        "request_summary": run.request_summary,
        "rating": rating_payload(rating) if rating else None,
        "video_title": video.title if video else "",
        "prompt_name": prompt.name if prompt else "",
        "prompt_version": pv.version if pv else 0,
        "blind": blind,
    }


def run_payload(session: Session, run_id: int, rater: str = "client") -> dict[str, Any]:
    run = session.get(Run, run_id)
    if run is None:
        raise KeyError(run_id)
    return _run_full(session, run, rater)


def _run_full(session: Session, run: Run, rater: str = "client") -> dict[str, Any]:
    video = session.get(Video, run.video_id)
    pv = session.get(PromptVersion, run.prompt_version_id)
    prompt = session.get(Prompt, pv.prompt_id) if pv else None
    batch = session.get(Batch, run.batch_id)
    rating = session.exec(
        select(Rating).where(Rating.run_id == run.id, Rating.rater == rater)
    ).first()
    return run_to_dict(run, video, pv, prompt, rating, bool(batch.blind) if batch else False)


def runs_payload(session: Session, runs: list[Run], rater: str = "client") -> list[dict[str, Any]]:
    return [_run_full(session, r, rater) for r in runs]


def batch_summary(session: Session, b: Batch) -> dict[str, Any]:
    video = session.get(Video, b.video_id)
    pv = session.get(PromptVersion, b.prompt_version_id)
    prompt = session.get(Prompt, pv.prompt_id) if pv else None
    counts = {s: 0 for s in ("queued", "running", "done", "error", "interrupted", "cancelled")}
    for status, n in session.exec(
        select(Run.status, func.count()).where(Run.batch_id == b.id).group_by(Run.status)
    ).all():
        counts[status] = int(n)
    return {
        "id": b.id,
        "name": b.name,
        "created_at": _iso(b.created_at),
        "video_id": b.video_id,
        "video_title": video.title if video else "",
        "prompt_version_id": b.prompt_version_id,
        "prompt_name": prompt.name if prompt else "",
        "prompt_version": pv.version if pv else 0,
        "frame_preset": b.frame_preset,
        "repeats": b.repeats,
        "blind": b.blind,
        "counts": counts,
        "run_count": sum(counts.values()),
    }


def batch_payload(session: Session, b: Batch, rater: str = "client") -> dict[str, Any]:
    d = batch_summary(session, b)
    runs = session.exec(select(Run).where(Run.batch_id == b.id).order_by(Run.id)).all()
    d["runs"] = runs_payload(session, list(runs), rater)
    return d
