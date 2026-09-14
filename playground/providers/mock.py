"""Mock provider for local development and UI testing (no API key, no GPU).

Enabled only when `PLAYGROUND_MOCK=1` is set; it streams a canned French coaching answer with
plausible timings and token counts so every dashboard column gets populated.
"""

from __future__ import annotations

import asyncio
import os
import random
import time
from typing import Any

from playground.providers.base import Provider, RunContext, RunResult, Usage

CANNED = (
    "**Points forts**\n\n"
    "- Préparation précoce du coup droit, plan de frappe devant le corps.\n"
    "- Reprise d'appuis (split-step) déclenchée au bon moment avant chaque frappe.\n"
    "- Revers à deux mains fluide avec une bonne dissociation épaules/hanches.\n\n"
    "**Axes d'amélioration**\n\n"
    "- Le buste se redresse un peu tôt sur les balles rapides : garder la hauteur des hanches jusqu'à la fin de l'accompagnement.\n"
    "- Flexion des genoux à renforcer sur les balles basses pour lifter avec les jambes plutôt qu'avec le bras.\n\n"
    "**Verdict** : niveau technique très solide pour une joueuse de 10 ans. "
    "(Réponse générée par le fournisseur de test, pas par un vrai modèle.)"
)


def mock_enabled() -> bool:
    return os.environ.get("PLAYGROUND_MOCK", "") in ("1", "true", "yes")


class MockProvider(Provider):
    name = "mock"

    async def check_availability(self, model: dict[str, Any]) -> tuple[bool, str | None]:
        return (True, None) if mock_enabled() else (False, "set PLAYGROUND_MOCK=1 to enable")

    async def run(self, ctx: RunContext) -> RunResult:
        params = ctx.params
        delay = float(params.get("delay_s", 4.0))
        rng = random.Random(f"{ctx.video.sha256}:{ctx.model['id']}:{time.time_ns()}")
        await ctx.progress("generate", "Generating (mock)")
        t0 = time.perf_counter()
        first_at: float | None = None
        words = CANNED.split(" ")
        per_word = delay / max(1, len(words))
        chunks = []
        for i, w in enumerate(words):
            ctx.check_cancelled()
            await asyncio.sleep(per_word * rng.uniform(0.5, 1.5))
            if first_at is None:
                first_at = time.perf_counter()
            piece = w + (" " if i < len(words) - 1 else "")
            chunks.append(piece)
            await ctx.delta(piece)
        t1 = time.perf_counter()
        frames = ctx.frames.count if ctx.frames else 0
        tokens_in = (
            frames * int(ctx.model.get("tokens_per_frame", 300)) + 400
            if frames
            else int(ctx.video.duration_s * 100) + 400
        )
        out_tokens = int(len(CANNED) / 3.5)
        load_ms = int(rng.uniform(1500, 4000)) if rng.random() < 0.3 else 0
        return RunResult(
            text="".join(chunks),
            usage=Usage(
                in_total=tokens_in,
                in_text=400,
                in_image=tokens_in - 400 if frames else None,
                in_video=None if frames else tokens_in - 400,
                out=out_tokens,
                thinking=0,
            ),
            model_load_ms=load_ms or None,
            ttft_ms=int((first_at - t0) * 1000) if first_at else None,
            model_ms=int((t1 - t0) * 1000),
            cold_start=load_ms > 1000,
            frames_sent=frames or None,
            video_seconds_sent=ctx.video.duration_s,
            model_vram_mb=int(rng.uniform(5500, 7500)),
            model_version="mock-1",
            sdk_versions={"mock": "1"},
            raw_usage={"note": "synthetic"},
            request_summary={
                "model": ctx.model["model_id"],
                "frames": frames,
                "user_text": ctx.user_text,
                "system_text": ctx.system_text,
            },
        )
