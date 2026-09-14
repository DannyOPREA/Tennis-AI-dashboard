from __future__ import annotations

import hashlib
import os
import re
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlmodel import Session, func, select
from starlette.concurrency import run_in_threadpool

from playground.api.deps import not_found
from playground.api.serialize import video_payload
from playground.config import get_settings
from playground.db import run_db
from playground.models import Run, Video
from playground.video import ffmpeg

router = APIRouter(prefix="/api/videos", tags=["videos"])
ALLOWED_SUFFIXES = {
    ".mp4",
    ".mov",
    ".webm",
    ".m4v",
    ".avi",
    ".mkv",
    ".mpeg",
    ".mpg",
    ".3gp",
    ".wmv",
}


def _safe_name(name: str) -> str:
    base = os.path.basename(name or "video")
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)[:120] or "video"


def _parse_tags(tags: str | None) -> list[str]:
    return [t.strip() for t in (tags or "").split(",") if t.strip()]


@router.get("")
async def list_videos():
    def _q(session: Session):
        return [
            video_payload(session, v)
            for v in session.exec(select(Video).order_by(Video.uploaded_at.desc())).all()
        ]  # type: ignore[attr-defined]

    return await run_db(_q)


@router.post("", status_code=201)
async def upload_video(
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form()] = None,
    tags: Annotated[str | None, Form()] = None,
):
    settings = get_settings()
    if not ffmpeg.ffmpeg_available():
        raise HTTPException(503, "ffmpeg/ffprobe not found on PATH")
    name = _safe_name(file.filename or "video.mp4")
    suffix = Path(name).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(400, f"unsupported file type {suffix}")

    tmp = settings.videos_dir / f"upload-{uuid.uuid4().hex}{suffix}"
    sha = hashlib.sha256()
    size = 0
    limit = settings.max_upload_mb * 1024 * 1024
    out = await run_in_threadpool(open, tmp, "wb")  # noqa: SIM115
    try:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, f"file larger than {settings.max_upload_mb} MB")
            sha.update(chunk)
            await run_in_threadpool(out.write, chunk)
    except HTTPException:
        out.close()
        tmp.unlink(missing_ok=True)
        raise
    finally:
        if not out.closed:
            out.close()
    digest = sha.hexdigest()

    existing = await run_db(lambda s: s.exec(select(Video).where(Video.sha256 == digest)).first())
    if existing:
        tmp.unlink(missing_ok=True)
        payload = await run_db(lambda s: video_payload(s, s.get(Video, existing.id)))
        return JSONResponse(payload, status_code=200)

    folder = settings.videos_dir / digest[:16]
    folder.mkdir(parents=True, exist_ok=True)
    original = folder / f"original{suffix}"
    tmp.replace(original)
    try:
        info = await ffmpeg.probe(str(original))
        playback = folder / "playback.mp4"
        await ffmpeg.make_playback_copy(str(original), str(playback), info.get("codec"))
        thumb = folder / "thumb.jpg"
        await ffmpeg.make_thumbnail(
            str(playback), str(thumb), at_s=min(1.0, max(0.0, info["duration_s"] / 3))
        )
    except ffmpeg.FfmpegError as e:
        original.unlink(missing_ok=True)
        raise HTTPException(400, f"could not process video: {e}") from e

    def _create(session: Session):
        v = Video(
            title=(title or Path(name).stem)[:200],
            filename=name,
            path_original=str(original),
            path_playback=str(playback),
            path_thumbnail=str(thumb),
            sha256=digest,
            duration_s=info["duration_s"],
            fps=info["fps"],
            width=info["width"],
            height=info["height"],
            size_bytes=size,
            has_audio=info["has_audio"],
            tags=_parse_tags(tags),
        )
        session.add(v)
        session.commit()
        session.refresh(v)
        return video_payload(session, v)

    return await run_db(_create)


@router.get("/{video_id}")
async def get_video(video_id: int):
    def _q(session: Session):
        v = session.get(Video, video_id)
        if v is None:
            raise not_found("video", video_id)
        return video_payload(session, v)

    return await run_db(_q)


class VideoPatch(BaseModel):
    title: str | None = None
    tags: list[str] | None = None


@router.patch("/{video_id}")
async def patch_video(video_id: int, body: VideoPatch):
    def _q(session: Session):
        v = session.get(Video, video_id)
        if v is None:
            raise not_found("video", video_id)
        if body.title is not None:
            v.title = body.title.strip()[:200] or v.title
        if body.tags is not None:
            v.tags = [t.strip() for t in body.tags if t.strip()]
        session.add(v)
        session.commit()
        session.refresh(v)
        return video_payload(session, v)

    return await run_db(_q)


@router.delete("/{video_id}", status_code=204)
async def delete_video(video_id: int):
    def _q(session: Session):
        v = session.get(Video, video_id)
        if v is None:
            raise not_found("video", video_id)
        n = session.exec(
            select(func.count()).select_from(Run).where(Run.video_id == video_id)
        ).one()
        if n:
            raise HTTPException(409, f"video has {n} runs; delete them first")
        for p in (v.path_original, v.path_playback, v.path_thumbnail):
            Path(p).unlink(missing_ok=True)
        session.delete(v)
        session.commit()

    await run_db(_q)


async def _video_or_404(video_id: int) -> Video:
    v = await run_db(lambda s: s.get(Video, video_id))
    if v is None:
        raise not_found("video", video_id)
    return v


@router.get("/{video_id}/file")
async def video_file(video_id: int):
    v = await _video_or_404(video_id)
    return FileResponse(
        v.path_playback,
        media_type="video/mp4",
        filename=f"{Path(v.filename).stem}.mp4",
        content_disposition_type="inline",
    )


@router.get("/{video_id}/thumbnail")
async def video_thumbnail(video_id: int):
    v = await _video_or_404(video_id)
    return FileResponse(v.path_thumbnail, media_type="image/jpeg")
