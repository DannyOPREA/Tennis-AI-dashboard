"""OpenAI-compatible chat completions with frames sent as base64 image_url parts.

Works for llama.cpp server, LM Studio, vLLM, OpenRouter and Ollama's /v1 endpoint. Ollama has
its own provider (native /api/chat) because that exposes load/eval timings.
"""

from __future__ import annotations

import json
import os
import time
from importlib.metadata import version as pkg_version
from typing import Any

import httpx

from playground.providers.base import (
    Provider,
    ProviderError,
    RunContext,
    RunResult,
    Usage,
    word_count,
)


def _headers(model: dict[str, Any]) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    env_name = (model.get("params") or {}).get("api_key_env")
    if env_name and os.environ.get(env_name):
        headers["Authorization"] = f"Bearer {os.environ[env_name]}"
    return headers


class OpenAICompatProvider(Provider):
    name = "openai_compat"

    async def check_availability(self, model: dict[str, Any]) -> tuple[bool, str | None]:
        base = model.get("base_url")
        if not base:
            return False, "base_url not set"
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                r = await client.get(f"{base.rstrip('/')}/models", headers=_headers(model))
                if r.status_code >= 400:
                    return False, f"endpoint returned {r.status_code}"
        except httpx.HTTPError:
            return False, "endpoint unreachable"
        return True, None

    def _messages(self, ctx: RunContext) -> list[dict[str, Any]]:
        if ctx.frames is None:
            raise ProviderError("openai_compat requires frames")
        content: list[dict[str, Any]] = [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
            for b64 in ctx.frames.as_base64()
        ]
        content.append({"type": "text", "text": ctx.user_text})
        messages: list[dict[str, Any]] = []
        if ctx.system_text:
            messages.append({"role": "system", "content": ctx.system_text})
        messages.append({"role": "user", "content": content})
        return messages

    async def run(self, ctx: RunContext) -> RunResult:
        base = (ctx.model.get("base_url") or "").rstrip("/")
        if not base:
            raise ProviderError("base_url not set")
        params = ctx.params
        payload = {
            "model": ctx.model["model_id"],
            "messages": self._messages(ctx),
            "stream": True,
            "stream_options": {"include_usage": True},
            "temperature": params.get("temperature", 0.4),
            "max_tokens": params.get("max_tokens", 4096),
        }
        await ctx.progress("generate", "Generating")
        result = RunResult(
            text="",
            frames_sent=ctx.frames.count if ctx.frames else 0,
            video_seconds_sent=ctx.video.duration_s,
        )
        chunks: list[str] = []
        usage_raw: dict[str, Any] = {}
        first_at: float | None = None
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=None)) as client:
            async with client.stream(
                "POST", f"{base}/chat/completions", json=payload, headers=_headers(ctx.model)
            ) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode(errors="replace")[:500]
                    raise ProviderError(f"{resp.status_code}: {body}")
                async for line in resp.aiter_lines():
                    ctx.check_cancelled()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if obj.get("usage"):
                        usage_raw = obj["usage"]
                    for choice in obj.get("choices") or []:
                        delta = (choice.get("delta") or {}).get("content")
                        if delta:
                            if first_at is None:
                                first_at = time.perf_counter()
                            chunks.append(delta)
                            await ctx.delta(delta)
                    result.model_version = obj.get("model") or result.model_version
        t1 = time.perf_counter()
        result.text = "".join(chunks)
        result.model_ms = int((t1 - t0) * 1000)
        result.ttft_ms = int((first_at - t0) * 1000) if first_at else None
        result.usage = Usage(
            in_total=usage_raw.get("prompt_tokens"),
            out=usage_raw.get("completion_tokens"),
            thinking=(usage_raw.get("completion_tokens_details") or {}).get("reasoning_tokens"),
        )
        result.raw_usage = usage_raw
        result.sdk_versions = {"httpx": pkg_version("httpx")}
        result.request_summary = {
            "endpoint": f"{base}/chat/completions",
            "model": ctx.model["model_id"],
            "frames": result.frames_sent,
            "temperature": payload["temperature"],
            "max_tokens": payload["max_tokens"],
            "user_text": ctx.user_text,
            "system_text": ctx.system_text,
            "output_words": word_count(result.text),
        }
        return result
