"""Gemini provider via google-genai (never litellm: it silently drops video parts).

Native mode uploads the original video through the Files API (cached on the Video row for
48 h) and streams generate_content. Frames mode sends the same JPEG frames as image parts as
the local models receive, for a like-for-like comparison.
"""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from importlib.metadata import version as pkg_version
from typing import Any

from playground.config import get_settings
from playground.providers.base import (
    Provider,
    ProviderError,
    ProviderNotConfigured,
    RunContext,
    RunResult,
    Usage,
)

MIME_BY_SUFFIX = {
    ".mp4": "video/mp4",
    ".mov": "video/mov",
    ".webm": "video/webm",
    ".avi": "video/avi",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpg",
    ".wmv": "video/wmv",
    ".3gp": "video/3gpp",
    ".flv": "video/x-flv",
}


def _client():
    settings = get_settings()
    if not settings.gemini_api_key:
        raise ProviderNotConfigured("GEMINI_API_KEY is not set")
    from google import genai

    return genai.Client(api_key=settings.gemini_api_key)


def _thinking_config(params: dict[str, Any]):
    from google.genai import types

    if "thinking_budget" in params and params["thinking_budget"] is not None:
        return types.ThinkingConfig(thinking_budget=int(params["thinking_budget"]))
    if params.get("thinking_level"):
        return types.ThinkingConfig(thinking_level=str(params["thinking_level"]).upper())
    return None


def _gen_config(ctx: RunContext):
    from google.genai import types

    params = ctx.params
    kwargs: dict[str, Any] = {
        "system_instruction": ctx.system_text or None,
        "temperature": params.get("temperature"),
        "max_output_tokens": params.get("max_tokens"),
    }
    if params.get("media_resolution"):
        kwargs["media_resolution"] = params["media_resolution"]
    tc = _thinking_config(params)
    if tc is not None:
        kwargs["thinking_config"] = tc
    return types.GenerateContentConfig(**{k: v for k, v in kwargs.items() if v is not None})


def _usage_from(meta: Any) -> tuple[Usage, dict[str, Any]]:
    if meta is None:
        return Usage(), {}
    raw = meta.model_dump(exclude_none=True) if hasattr(meta, "model_dump") else dict(meta)
    usage = Usage(
        in_total=getattr(meta, "prompt_token_count", None),
        out=getattr(meta, "candidates_token_count", None),
        thinking=getattr(meta, "thoughts_token_count", None),
        in_cached=getattr(meta, "cached_content_token_count", None),
    )
    for item in getattr(meta, "prompt_tokens_details", None) or []:
        modality = str(getattr(item, "modality", "")).split(".")[-1].upper()
        count = int(getattr(item, "token_count", 0) or 0)
        if modality == "TEXT":
            usage.in_text = (usage.in_text or 0) + count
        elif modality == "IMAGE":
            usage.in_image = (usage.in_image or 0) + count
        elif modality == "VIDEO":
            usage.in_video = (usage.in_video or 0) + count
        elif modality == "AUDIO":
            usage.in_audio = (usage.in_audio or 0) + count
    return usage, raw


class GeminiProvider(Provider):
    name = "gemini"

    async def check_availability(self, model: dict[str, Any]) -> tuple[bool, str | None]:
        if not get_settings().gemini_api_key:
            return False, "GEMINI_API_KEY not set"
        return True, None

    async def _ensure_file(
        self, ctx: RunContext, client
    ) -> tuple[Any, int, bool, dict[str, Any] | None]:
        """Return (file part source, upload_ms, cache_hit, video_cache_update)."""
        from google.genai import types

        video = ctx.video
        now = datetime.now(UTC).replace(tzinfo=None)
        if (
            video.gemini_file_uri
            and video.gemini_file_expires_at
            and video.gemini_file_expires_at > now + timedelta(minutes=5)
        ):
            try:
                f = await client.aio.files.get(name=video.gemini_file_name)
                if f.state and f.state.name == "ACTIVE":
                    return types.Part.from_uri(file_uri=f.uri, mime_type=f.mime_type), 0, True, None
            except Exception:  # noqa: BLE001 - fall through to re-upload
                pass

        await ctx.progress("upload", "Uploading video to Gemini Files API")
        t0 = time.perf_counter()
        f = await client.aio.files.upload(file=str(video.path_original))
        while f.state is None or f.state.name == "PROCESSING":
            ctx.check_cancelled()
            await asyncio.sleep(2)
            f = await client.aio.files.get(name=f.name)
        if f.state.name != "ACTIVE":
            raise ProviderError(f"Gemini file state {f.state.name}")
        upload_ms = int((time.perf_counter() - t0) * 1000)
        expires = now + timedelta(hours=47)
        update = {
            "gemini_file_uri": f.uri,
            "gemini_file_name": f.name,
            "gemini_file_expires_at": expires,
        }
        return types.Part.from_uri(file_uri=f.uri, mime_type=f.mime_type), upload_ms, False, update

    def _frame_parts(self, ctx: RunContext) -> list[Any]:
        from google.genai import types

        assert ctx.frames is not None
        return [
            types.Part.from_bytes(data=b, mime_type="image/jpeg") for b in ctx.frames.as_bytes()
        ]

    async def _build_contents(self, ctx: RunContext, client) -> tuple[list[Any], RunResult]:
        result = RunResult(text="")
        if ctx.input_mode == "native_video":
            part, upload_ms, cache_hit, update = await self._ensure_file(ctx, client)
            result.upload_ms, result.cache_hit, result.video_cache_update = (
                upload_ms,
                cache_hit,
                update,
            )
            result.video_seconds_sent = ctx.video.duration_s
            contents = [part, ctx.user_text]
        else:
            if ctx.frames is None:
                raise ProviderError("frames mode requires extracted frames")
            parts = self._frame_parts(ctx)
            result.frames_sent = len(parts)
            result.video_seconds_sent = ctx.video.duration_s
            contents = [*parts, ctx.user_text]
        return contents, result

    async def estimate_tokens(self, ctx: RunContext) -> tuple[int, bool]:
        try:
            client = _client()
            contents, _ = await self._build_contents(ctx, client)
            resp = await client.aio.models.count_tokens(
                model=ctx.model["model_id"], contents=contents
            )
            sys_tokens = len(ctx.system_text) // 4
            return int(resp.total_tokens or 0) + sys_tokens, True
        except ProviderNotConfigured:
            return await super().estimate_tokens(ctx)
        except Exception:  # noqa: BLE001 - estimate must never fail the UI
            return await super().estimate_tokens(ctx)

    async def run(self, ctx: RunContext) -> RunResult:
        client = _client()
        contents, result = await self._build_contents(ctx, client)
        config = _gen_config(ctx)
        await ctx.progress("generate", "Generating")

        t0 = time.perf_counter()
        first_token_at: float | None = None
        chunks: list[str] = []
        last_meta = None
        model_version = None
        stream = await client.aio.models.generate_content_stream(
            model=ctx.model["model_id"], contents=contents, config=config
        )
        async for chunk in stream:
            ctx.check_cancelled()
            text = getattr(chunk, "text", None)
            if text:
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                chunks.append(text)
                await ctx.delta(text)
            if getattr(chunk, "usage_metadata", None) is not None:
                last_meta = chunk.usage_metadata
            model_version = getattr(chunk, "model_version", None) or model_version
        t1 = time.perf_counter()

        result.text = "".join(chunks)
        result.model_ms = int((t1 - t0) * 1000)
        result.ttft_ms = int((first_token_at - t0) * 1000) if first_token_at else None
        result.usage, result.raw_usage = _usage_from(last_meta)
        result.model_version = model_version
        result.sdk_versions = {"google-genai": pkg_version("google-genai")}
        result.request_summary = {
            "model": ctx.model["model_id"],
            "input_mode": ctx.input_mode,
            "config": config.model_dump(exclude_none=True, mode="json"),
            "user_text": ctx.user_text,
            "system_text": ctx.system_text,
        }
        return result
