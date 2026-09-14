"""Frame extraction according to a FramePreset, cached per (video sha, plan hash, extractor version)."""

from __future__ import annotations

import base64
import hashlib
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path

from playground.config import get_settings
from playground.registry.loader import FramePreset
from playground.video import ffmpeg

EXTRACTOR_VERSION = 1


@dataclass
class FramePlan:
    fps: float
    long_edge: int
    max_frames: int
    jpeg_quality: int
    preset: str

    @classmethod
    def from_preset(cls, p: FramePreset) -> FramePlan:
        return cls(
            fps=p.fps,
            long_edge=p.long_edge,
            max_frames=p.max_frames,
            jpeg_quality=p.jpeg_quality,
            preset=p.key,
        )

    def to_dict(self) -> dict:
        return {
            "key": self.preset,
            "label": self.preset,
            "description": "",
            "fps": self.fps,
            "long_edge": self.long_edge,
            "max_frames": self.max_frames,
            "jpeg_quality": self.jpeg_quality,
        }

    def hash(self) -> str:
        payload = json.dumps(
            {
                "v": EXTRACTOR_VERSION,
                "fps": self.fps,
                "le": self.long_edge,
                "mf": self.max_frames,
                "q": self.jpeg_quality,
            },
            sort_keys=True,
        )
        return hashlib.sha1(payload.encode()).hexdigest()[:12]

    def effective_fps(self, duration_s: float) -> float:
        """Uniform sampling rate after applying the max_frames cap."""
        if duration_s <= 0:
            return self.fps
        return min(self.fps, self.max_frames / duration_s)

    def expected_frames(self, duration_s: float) -> int:
        if duration_s <= 0:
            return 0
        return max(1, min(self.max_frames, math.ceil(duration_s * self.fps)))


@dataclass
class ExtractedFrames:
    directory: Path
    paths: list[Path]
    timestamps: list[float]
    cache_hit: bool
    extract_ms: int
    contact_sheet: Path | None

    @property
    def count(self) -> int:
        return len(self.paths)

    def as_base64(self) -> list[str]:
        return [base64.b64encode(p.read_bytes()).decode("ascii") for p in self.paths]

    def as_bytes(self) -> list[bytes]:
        return [p.read_bytes() for p in self.paths]


def frames_dir_for(video_sha: str, plan: FramePlan) -> Path:
    return get_settings().frames_dir / video_sha[:16] / plan.hash()


async def extract(
    video_path: str, video_sha: str, duration_s: float, plan: FramePlan
) -> ExtractedFrames:
    out_dir = frames_dir_for(video_sha, plan)
    manifest = out_dir / "manifest.json"
    if manifest.exists():
        data = json.loads(manifest.read_text())
        paths = [out_dir / n for n in data["files"]]
        if all(p.exists() for p in paths):
            sheet = out_dir / "contact_sheet.jpg"
            return ExtractedFrames(
                out_dir, paths, data["timestamps"], True, 0, sheet if sheet.exists() else None
            )

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()
    t0 = time.perf_counter()
    eff_fps = plan.effective_fps(duration_s)
    q = max(
        2, min(31, round(31 - (plan.jpeg_quality / 100) * 29))
    )  # map 0-100 quality to ffmpeg qscale
    vf = f"fps={eff_fps:.6f},scale='if(gt(iw,ih),min({plan.long_edge},iw),-2)':'if(gt(iw,ih),-2,min({plan.long_edge},ih))'"
    await ffmpeg.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            video_path,
            "-vf",
            vf,
            "-frames:v",
            str(plan.max_frames),
            "-q:v",
            str(q),
            str(out_dir / "f%05d.jpg"),
        ]
    )
    paths = sorted(out_dir.glob("f*.jpg"))[: plan.max_frames]
    timestamps = [round(i / eff_fps, 3) for i in range(len(paths))]

    sheet: Path | None = None
    if paths:
        cols = min(10, max(1, math.ceil(math.sqrt(len(paths)))))
        rows = math.ceil(len(paths) / cols)
        sheet = out_dir / "contact_sheet.jpg"
        try:
            await ffmpeg.run(
                [
                    "ffmpeg",
                    "-y",
                    "-framerate",
                    "1",
                    "-i",
                    str(out_dir / "f%05d.jpg"),
                    "-vf",
                    f"scale=192:-2,tile={cols}x{rows}:padding=2:margin=2",
                    "-frames:v",
                    "1",
                    "-q:v",
                    "5",
                    str(sheet),
                ],
                timeout_s=120,
            )
        except ffmpeg.FfmpegError:
            sheet = None

    extract_ms = int((time.perf_counter() - t0) * 1000)
    manifest.write_text(
        json.dumps(
            {"files": [p.name for p in paths], "timestamps": timestamps, "extract_ms": extract_ms}
        )
    )
    return ExtractedFrames(out_dir, paths, timestamps, False, extract_ms, sheet)
