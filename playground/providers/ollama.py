"""Ollama provider using the native /api/chat endpoint.

Why native rather than /v1: it returns load_duration, prompt_eval_count/duration and
eval_count/duration, lets us set num_ctx per request (Ollama silently truncates prompts that
exceed the default context, which would drop frames without any error), and /api/ps reports the
VRAM actually used by the loaded model.
"""

from __future__ import annotations

import json
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

CTX_MARGIN = 2048
CTX_ROUND = 1024


def compute_num_ctx(
    frames: int, tokens_per_frame: int, text_chars: int, max_tokens: int, margin: int = CTX_MARGIN
) -> int:
    needed = frames * tokens_per_frame + text_chars // 4 + max_tokens + margin
    return max(4096, ((needed + CTX_ROUND - 1) // CTX_ROUND) * CTX_ROUND)


def truncation_suspected(
    prompt_eval_count: int | None, frames: int, tokens_per_frame: int, num_ctx: int
) -> bool:
    if prompt_eval_count is None:
        return False
    if frames and prompt_eval_count < frames * max(8, tokens_per_frame // 6):
        return True  # far fewer prompt tokens than the images alone should produce
    return prompt_eval_count >= int(num_ctx * 0.97)


class OllamaProvider(Provider):
    name = "ollama"

    async def _tags(self, base: str) -> set[str]:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{base}/api/tags")
            r.raise_for_status()
            names = set()
            for m in r.json().get("models") or []:
                n = m.get("name", "")
                names.add(n)
                if n.endswith(":latest"):
                    names.add(n[: -len(":latest")])
            return names

    async def check_availability(self, model: dict[str, Any]) -> tuple[bool, str | None]:
        base = (model.get("base_url") or "").rstrip("/")
        if not base:
            return False, "OLLAMA_URL not set"
        try:
            tags = await self._tags(base)
        except (httpx.HTTPError, ValueError):
            return False, "Ollama unreachable"
        if model["model_id"] not in tags and f"{model['model_id']}:latest" not in tags:
            return False, "not pulled in Ollama"
        return True, None

    async def _show_digest(self, client: httpx.AsyncClient, base: str, model_id: str) -> str | None:
        try:
            r = await client.post(f"{base}/api/show", json={"model": model_id}, timeout=10)
            if r.status_code == 200:
                d = r.json()
                return (
                    (d.get("details") or {}).get("family")
                    and f"{d.get('details', {}).get('family')}:{d.get('details', {}).get('parameter_size')}:{d.get('details', {}).get('quantization_level')}"
                )
        except httpx.HTTPError:
            return None
        return None

    async def _vram(self, client: httpx.AsyncClient, base: str, model_id: str) -> int | None:
        try:
            r = await client.get(f"{base}/api/ps", timeout=5)
            for m in r.json().get("models") or []:
                if m.get("name") in (model_id, f"{model_id}:latest") or m.get("model") in (
                    model_id,
                    f"{model_id}:latest",
                ):
                    return int(m.get("size_vram", 0) / (1024 * 1024))
        except (httpx.HTTPError, ValueError):
            return None
        return None

    async def run(self, ctx: RunContext) -> RunResult:
        base = (ctx.model.get("base_url") or "").rstrip("/")
        if not base:
            raise ProviderError("OLLAMA_URL not set")
        if ctx.frames is None:
            raise ProviderError("ollama requires frames")
        params = ctx.params
        images = ctx.frames.as_base64()
        max_images = ctx.model.get("max_images")
        if max_images and len(images) > int(max_images):
            images = images[: int(max_images)]
        tokens_per_frame = int(ctx.model.get("tokens_per_frame", 300))
        max_tokens = int(params.get("max_tokens", 4096))
        num_ctx = int(
            params.get("num_ctx")
            or compute_num_ctx(
                len(images), tokens_per_frame, len(ctx.system_text) + len(ctx.user_text), max_tokens
            )
        )

        messages: list[dict[str, Any]] = []
        if ctx.system_text:
            messages.append({"role": "system", "content": ctx.system_text})
        messages.append({"role": "user", "content": ctx.user_text, "images": images})
        payload = {
            "model": ctx.model["model_id"],
            "messages": messages,
            "stream": True,
            "keep_alive": params.get("keep_alive", "30m"),
            # Reasoning models (Qwen 3.x, Gemma 4...) otherwise burn the whole num_predict budget on
            # hidden thinking and return an empty answer. Set params.think: true to measure it.
            "think": bool(params.get("think", False)),
            "options": {
                "num_ctx": num_ctx,
                "temperature": params.get("temperature", 0.4),
                "num_predict": max_tokens,
            },
        }
        await ctx.progress("generate", f"Generating (num_ctx={num_ctx})")
        result = RunResult(
            text="", frames_sent=len(images), video_seconds_sent=ctx.video.duration_s
        )
        chunks: list[str] = []
        thinking_chars = 0
        final: dict[str, Any] = {}
        first_at: float | None = None
        t0 = time.perf_counter()
        async with httpx.AsyncClient(timeout=httpx.Timeout(30, read=None)) as client:
            try:
                version = (await client.get(f"{base}/api/version", timeout=5)).json().get("version")
            except (httpx.HTTPError, ValueError):
                version = None
            async with client.stream("POST", f"{base}/api/chat", json=payload) as resp:
                if resp.status_code >= 400:
                    body = (await resp.aread()).decode(errors="replace")[:500]
                    raise ProviderError(f"Ollama {resp.status_code}: {body}")
                async for line in resp.aiter_lines():
                    ctx.check_cancelled()
                    if not line.strip():
                        continue
                    obj = json.loads(line)
                    if obj.get("error"):
                        raise ProviderError(str(obj["error"]))
                    msg = obj.get("message") or {}
                    if msg.get("thinking"):
                        thinking_chars += len(msg["thinking"])
                    content = msg.get("content")
                    if content:
                        if first_at is None:
                            first_at = time.perf_counter()
                        chunks.append(content)
                        await ctx.delta(content)
                    if obj.get("done"):
                        final = obj
            t1 = time.perf_counter()
            result.model_vram_mb = await self._vram(client, base, ctx.model["model_id"])
            result.model_version = await self._show_digest(client, base, ctx.model["model_id"])

        result.text = "".join(chunks)
        load_ns = final.get("load_duration") or 0
        result.model_load_ms = int(load_ns / 1e6)
        result.cold_start = load_ns > 1_000_000_000
        result.model_ms = int((t1 - t0) * 1000) - result.model_load_ms
        result.ttft_ms = int((first_at - t0) * 1000) if first_at else None
        prompt_tokens = final.get("prompt_eval_count")
        eval_count = final.get("eval_count")
        thinking_tokens = None
        if thinking_chars and eval_count:
            # Ollama's eval_count covers thinking + answer; split it by character share.
            share = thinking_chars / max(1, thinking_chars + len("".join(chunks)))
            thinking_tokens = int(round(eval_count * share))
            eval_count = eval_count - thinking_tokens
        result.usage = Usage(in_total=prompt_tokens, out=eval_count, thinking=thinking_tokens)
        result.truncated_suspected = truncation_suspected(
            prompt_tokens, len(images), tokens_per_frame, num_ctx
        )
        result.raw_usage = {k: v for k, v in final.items() if k not in ("message",)}
        result.sdk_versions = {"httpx": pkg_version("httpx"), "ollama": version or "unknown"}
        result.request_summary = {
            "endpoint": f"{base}/api/chat",
            "model": ctx.model["model_id"],
            "frames": len(images),
            "num_ctx": num_ctx,
            "options": payload["options"],
            "keep_alive": payload["keep_alive"],
            "user_text": ctx.user_text,
            "system_text": ctx.system_text,
            "output_words": word_count(result.text),
        }
        return result
