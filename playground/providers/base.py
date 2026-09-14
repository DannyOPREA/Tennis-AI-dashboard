"""Provider protocol and result types shared by all model backends."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from playground.models import PromptVersion, Video
from playground.video.frames import ExtractedFrames, FramePlan

LANGUAGE_INSTRUCTIONS = {
    "fr": "Réponds entièrement en français.",
    "en": "Answer entirely in English.",
}


class ProviderError(RuntimeError):
    pass


class ProviderNotConfigured(ProviderError):
    pass


class RunCancelled(ProviderError):
    pass


@dataclass
class Usage:
    in_total: int | None = None
    in_text: int | None = None
    in_image: int | None = None
    in_video: int | None = None
    in_audio: int | None = None
    in_cached: int | None = None
    out: int | None = None
    thinking: int | None = None


@dataclass
class RunResult:
    text: str
    usage: Usage = field(default_factory=Usage)
    upload_ms: int | None = None
    model_load_ms: int | None = None
    ttft_ms: int | None = None
    model_ms: int | None = None
    cold_start: bool = False
    cache_hit: bool = False
    truncated_suspected: bool = False
    frames_sent: int | None = None
    video_seconds_sent: float | None = None
    model_vram_mb: int | None = None
    model_version: str | None = None
    sdk_versions: dict[str, str] = field(default_factory=dict)
    raw_usage: dict[str, Any] = field(default_factory=dict)
    request_summary: dict[str, Any] = field(default_factory=dict)
    video_cache_update: dict[str, Any] | None = None  # e.g. Gemini file uri to persist on the Video


ProgressFn = Callable[[str, str], Awaitable[None]]
DeltaFn = Callable[[str], Awaitable[None]]


async def _noop_progress(_stage: str, _message: str) -> None:
    return None


async def _noop_delta(_text: str) -> None:
    return None


@dataclass
class RunContext:
    video: Video
    prompt: PromptVersion
    model: dict[str, Any]  # immutable snapshot of ModelConfig.to_dict()
    input_mode: str
    plan: FramePlan | None
    frames: ExtractedFrames | None
    progress: ProgressFn = _noop_progress
    delta: DeltaFn = _noop_delta
    cancel: asyncio.Event = field(default_factory=asyncio.Event)

    @property
    def user_text(self) -> str:
        instr = LANGUAGE_INSTRUCTIONS.get(self.prompt.output_language, "")
        return f"{self.prompt.user_text.rstrip()}\n\n{instr}".strip()

    @property
    def system_text(self) -> str:
        return self.prompt.system_text.strip()

    @property
    def params(self) -> dict[str, Any]:
        return self.model.get("params") or {}

    def check_cancelled(self) -> None:
        if self.cancel.is_set():
            raise RunCancelled("cancelled")


class Provider:
    name = "base"

    async def run(self, ctx: RunContext) -> RunResult:  # pragma: no cover - interface
        raise NotImplementedError

    async def estimate_tokens(self, ctx: RunContext) -> tuple[int, bool]:
        """Return (estimated input tokens, exact?)."""
        frames = (
            ctx.frames.count
            if ctx.frames
            else (ctx.plan.expected_frames(ctx.video.duration_s) if ctx.plan else 0)
        )
        text_tokens = (len(ctx.system_text) + len(ctx.user_text)) // 4
        return frames * int(ctx.model.get("tokens_per_frame", 300)) + text_tokens, False

    async def check_availability(self, model: dict[str, Any]) -> tuple[bool, str | None]:
        return True, None


def word_count(text: str) -> int:
    return len([w for w in text.split() if w.strip()])
