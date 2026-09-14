"""Every metric column is populated from a provider result and cost matches the price table."""

from playground.models import METRIC_FIELDS, Run
from playground.providers.base import RunResult, Usage
from playground.providers.pricing import api_cost_usd
from playground.runs.gpu import GpuStats
from playground.runs.service import apply_result

PRICES = {
    "text_in": 0.30,
    "image_in": 0.30,
    "video_in": 0.30,
    "audio_in": 1.0,
    "cached_in": 0.075,
    "out": 2.5,
}


def _run(provider: str) -> Run:
    return Run(
        batch_id=1,
        video_id=1,
        prompt_version_id=1,
        model_config_id="m",
        model_label="M",
        provider=provider,
        model_snapshot={"prices": PRICES},
        input_mode="frames",
        frame_preset="quick",
        host="h",
    )


def test_gemini_like_result_populates_all_metrics():
    run = _run("gemini")
    res = RunResult(
        text="Bonjour " * 50,
        usage=Usage(
            in_total=12_000, in_text=200, in_video=9_000, in_audio=2_800, out=400, thinking=100
        ),
        upload_ms=1500,
        model_load_ms=None,
        ttft_ms=900,
        model_ms=4000,
        cold_start=False,
        cache_hit=False,
        frames_sent=None,
        video_seconds_sent=30.0,
        model_version="gemini-2.5-flash-lite-001",
        sdk_versions={"google-genai": "2.23.0"},
        raw_usage={"prompt_token_count": 12_000},
    )
    apply_result(run, res, None, extract_ms=None, frames_cache_hit=False)
    assert run.total_ms == 5500 and run.output_words == 50 and run.tokens_out_per_s == 100.0
    assert run.cost_api_usd == api_cost_usd(res.usage, PRICES) and run.cost_api_usd > 0
    missing = [
        f
        for f in METRIC_FIELDS
        if getattr(run, f) is None
        and f
        not in (
            "model_load_ms",
            "extract_ms",
            "tokens_in_image",
            "tokens_in_cached",
            "frames_sent",
            "gpu_seconds",
            "gpu_energy_wh",
            "cost_energy_usd",
            "gpu_peak_vram_delta_mb",
            "model_vram_mb",
        )
    ]
    assert missing == [], missing


def test_local_result_uses_gpu_stats_and_zero_api_cost():
    run = _run("ollama")
    run.model_snapshot = {"prices": {}}
    res = RunResult(
        text="Réponse.",
        usage=Usage(in_total=40_000, out=300),
        model_load_ms=2500,
        ttft_ms=3000,
        model_ms=20_000,
        cold_start=True,
        frames_sent=90,
        video_seconds_sent=45.0,
        model_vram_mb=6600,
        truncated_suspected=False,
        sdk_versions={"ollama": "0.20"},
    )
    apply_result(
        run,
        res,
        GpuStats(gpu_seconds=22.5, gpu_energy_wh=1.2, peak_vram_delta_mb=9000, util_avg=80.0),
        extract_ms=800,
        frames_cache_hit=True,
    )
    assert run.cost_api_usd == 0.0 and run.cost_energy_usd == round(1.2 / 1000 * 0.25, 8)
    assert run.total_ms == 800 + 2500 + 20_000 and run.cache_hit is True and run.cold_start is True
    assert (
        run.gpu_peak_vram_delta_mb == 9000 and run.model_vram_mb == 6600 and run.frames_sent == 90
    )
