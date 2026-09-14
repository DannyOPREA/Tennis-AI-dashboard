"""Cost = Σ measured modality tokens × snapshot prices (USD per 1M tokens)."""

from __future__ import annotations

from typing import Any

from playground.providers.base import Usage


def api_cost_usd(usage: Usage, prices: dict[str, Any]) -> float | None:
    def p(key: str) -> float:
        try:
            return float(prices.get(key) or 0)
        except (TypeError, ValueError):
            return 0.0

    if usage.in_total is None and usage.out is None:
        return None
    cost = 0.0
    modality_known = any(
        v is not None for v in (usage.in_text, usage.in_image, usage.in_video, usage.in_audio)
    )
    if modality_known:
        cost += (usage.in_text or 0) / 1e6 * p("text_in")
        cost += (usage.in_image or 0) / 1e6 * p("image_in")
        cost += (usage.in_video or 0) / 1e6 * p("video_in")
        cost += (usage.in_audio or 0) / 1e6 * p("audio_in")
        accounted = (
            (usage.in_text or 0)
            + (usage.in_image or 0)
            + (usage.in_video or 0)
            + (usage.in_audio or 0)
        )
        remainder = max(0, (usage.in_total or 0) - accounted)
        cost += remainder / 1e6 * p("text_in")
    else:
        cost += (usage.in_total or 0) / 1e6 * p("text_in")
    if usage.in_cached:
        # cached tokens are billed at the cached rate instead of the text rate
        cost -= usage.in_cached / 1e6 * (p("text_in") - p("cached_in"))
    cost += ((usage.out or 0) + (usage.thinking or 0)) / 1e6 * p("out")
    return round(max(cost, 0.0), 8)


def energy_cost_usd(gpu_energy_wh: float | None, price_per_kwh: float) -> float | None:
    if gpu_energy_wh is None:
        return None
    return round(gpu_energy_wh / 1000 * price_per_kwh, 8)
