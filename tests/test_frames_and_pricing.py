from playground.providers.base import Usage
from playground.providers.ollama import compute_num_ctx, truncation_suspected
from playground.providers.pricing import api_cost_usd
from playground.registry.loader import FramePreset
from playground.video.frames import FramePlan


def test_frame_plan_caps_frames():
    plan = FramePlan.from_preset(
        FramePreset("light16", "L", "", fps=2, long_edge=512, max_frames=180)
    )
    assert plan.expected_frames(30) == 60
    assert plan.expected_frames(120) == 180
    assert abs(plan.effective_fps(120) - 1.5) < 1e-9
    assert plan.effective_fps(30) == 2
    assert plan.hash() == FramePlan.from_preset(FramePreset("x", "L", "", 2, 512, 180)).hash()


def test_cost_uses_modalities_and_thinking():
    prices = {
        "text_in": 0.10,
        "image_in": 0.10,
        "video_in": 0.10,
        "audio_in": 0.30,
        "cached_in": 0.025,
        "out": 0.40,
    }
    u = Usage(
        in_total=10_000, in_text=1_000, in_video=6_000, in_audio=3_000, out=500, thinking=1_500
    )
    cost = api_cost_usd(u, prices)
    expected = (1_000 * 0.10 + 6_000 * 0.10 + 3_000 * 0.30) / 1e6 + 2_000 * 0.40 / 1e6
    assert abs(cost - expected) < 1e-9


def test_cost_total_only_and_free_local():
    assert api_cost_usd(Usage(in_total=50_000, out=800), {"text_in": 0.30, "out": 2.50}) == round(
        (50_000 * 0.30 + 800 * 2.50) / 1e6, 8
    )
    assert api_cost_usd(Usage(in_total=50_000, out=800), {}) == 0.0
    assert api_cost_usd(Usage(), {"text_in": 1}) is None


def test_num_ctx_and_truncation():
    ctx = compute_num_ctx(frames=180, tokens_per_frame=350, text_chars=2000, max_tokens=4096)
    assert ctx >= 180 * 350 + 4096 + 2048
    assert ctx % 1024 == 0
    assert truncation_suspected(
        prompt_eval_count=ctx - 10, frames=180, tokens_per_frame=350, num_ctx=ctx
    )
    assert truncation_suspected(
        prompt_eval_count=500, frames=180, tokens_per_frame=350, num_ctx=ctx
    )
    assert not truncation_suspected(
        prompt_eval_count=60_000, frames=180, tokens_per_frame=350, num_ctx=ctx
    )
    assert not truncation_suspected(None, 180, 350, ctx)
