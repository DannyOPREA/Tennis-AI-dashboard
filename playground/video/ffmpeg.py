"""Async wrappers around ffmpeg / ffprobe."""

from __future__ import annotations

import asyncio
import json
import shutil
from typing import Any


class FfmpegError(RuntimeError):
    pass


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


async def run(cmd: list[str], timeout_s: float = 600) -> tuple[bytes, bytes]:
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except TimeoutError:
        proc.kill()
        raise FfmpegError(f"timed out: {' '.join(cmd[:3])}") from None
    if proc.returncode != 0:
        raise FfmpegError(err.decode(errors="replace")[-2000:])
    return out, err


async def probe(path: str) -> dict[str, Any]:
    out, _ = await run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        timeout_s=60,
    )
    info = json.loads(out.decode())
    video = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if video is None:
        raise FfmpegError("no video stream found")
    audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    fps = 0.0
    rate = video.get("avg_frame_rate") or video.get("r_frame_rate") or "0/1"
    try:
        num, den = rate.split("/")
        fps = float(num) / float(den) if float(den) else 0.0
    except ValueError:
        fps = float(rate or 0)
    duration = float(info.get("format", {}).get("duration") or video.get("duration") or 0)
    rotation = 0
    for sd in video.get("side_data_list", []) or []:
        if "rotation" in sd:
            rotation = int(sd["rotation"])
    width, height = int(video.get("width", 0)), int(video.get("height", 0))
    if rotation in (90, -90, 270, -270):
        width, height = height, width
    return {
        "duration_s": duration,
        "fps": fps,
        "width": width,
        "height": height,
        "has_audio": audio,
        "codec": video.get("codec_name"),
    }


H264_CANDIDATES: dict[str, list[str]] = {
    "libx264": ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"],
    "h264_nvenc": ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"],
    "libopenh264": ["-c:v", "libopenh264", "-b:v", "2500k"],
}
_h264_choice: str | None = None


async def pick_h264_encoder() -> str | None:
    """Trial-encode a few frames per candidate; cache the first that works (None = no H.264 encoder)."""
    global _h264_choice
    if _h264_choice is not None:
        return _h264_choice or None
    for name, args in H264_CANDIDATES.items():
        try:
            await run(
                [
                    "ffmpeg",
                    "-v",
                    "error",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=duration=0.2:size=64x64:rate=5",
                    *args,
                    "-pix_fmt",
                    "yuv420p",
                    "-f",
                    "null",
                    "-",
                ],
                timeout_s=30,
            )
            _h264_choice = name
            return name
        except FfmpegError:
            continue
    _h264_choice = ""
    return None


async def make_playback_copy(src: str, dst: str, source_codec: str | None = None) -> None:
    """H.264 + AAC, faststart so browsers can seek; original untouched."""
    encoder = await pick_h264_encoder()
    if encoder is None:
        if source_codec == "h264":
            video_args = ["-c:v", "copy"]
        else:
            raise FfmpegError(
                "no H.264 encoder in this ffmpeg build (need libx264, h264_nvenc or libopenh264)"
            )
    else:
        video_args = [
            *H264_CANDIDATES[encoder],
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale='min(1280,iw)':-2",
        ]
    await run(
        [
            "ffmpeg",
            "-y",
            "-i",
            src,
            *video_args,
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            dst,
        ]
    )


async def make_thumbnail(src: str, dst: str, at_s: float = 1.0) -> None:
    await run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{max(0.0, at_s):.2f}",
            "-i",
            src,
            "-frames:v",
            "1",
            "-vf",
            "scale=480:-2",
            "-q:v",
            "4",
            dst,
        ],
        timeout_s=60,
    )
