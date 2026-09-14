---
name: local-vlm
description: Running open-weight vision models locally for the playground: ffmpeg frame extraction, Ollama native API (num_ctx maths, truncation check, timings, VRAM), OpenAI-compatible endpoints (llama.cpp, LM Studio, vLLM), VRAM budgeting on 16GB, model shortlist with Ollama tags and caveats. Use when writing playground/video/frames.py, providers/ollama.py, providers/openai_compat.py, models.yaml rows or the Windows scripts.
---

# Local vision models

Research verified 2026-09-14; items marked *unverified* need the `model-scout` agent.

## Why frames, not video
Ollama accepts images only (video input was briefly present in early 2026 and removed, issue
ollama/ollama#14900). LM Studio has no video input. llama.cpp 0.4.0 has native video but fps
control is *unverified*. vLLM has proper video input but no official Windows build (WSL2 only).
So every local runtime gets ffmpeg-extracted JPEG frames. Same pipeline, swappable models,
and Gemini can be run on identical frames for a fair comparison.

## Frame extraction (uniform sampling)
```bash
ffmpeg -y -hide_banner -loglevel error -i in.mp4 \
  -vf "fps=2,scale='if(gt(iw,ih),512,-2)':'if(gt(iw,ih),-2,512)'" \
  -q:v 3 frames/%04d.jpg
# clip a window: add -ss 12.0 -t 6.0 before -i for fast seek
```
- Presets (from `models.yaml`): Quick 1 fps, Light-16GB 2 fps / 512 px / max 180 frames,
  Dense-24GB 4 fps / max 360. Enforce `max_frames` by lowering fps, never by truncating the tail.
- Cache key: `(video_sha256, frame_plan_hash, extractor_version)`. Bump `extractor_version`
  when the ffmpeg filter changes.
- Contact sheet for the UI: `ffmpeg -i frames/%04d.jpg -vf "scale=160:-2,tile=10x0" sheet.jpg`.
- Run ffmpeg with `asyncio.create_subprocess_exec`; never block the event loop.
- Contact-burst sampling (dense fps around the racket hit, detected from the audio peak) is v1.1.

## Ollama native API (preferred over its /v1 endpoint)
`POST {OLLAMA_URL}/api/chat`
```json
{"model": "qwen3.5:9b", "stream": true,
 "messages": [{"role": "system", "content": "..."},
              {"role": "user", "content": "...", "images": ["<base64 jpeg>", "..."]}],
 "options": {"num_ctx": 49152, "temperature": 0.2, "num_predict": 2048}}
```
- `num_ctx = frames * tokens_per_frame + text_tokens + 2048` (margin). `tokens_per_frame` is a
  per-model field in `models.yaml` (Qwen-VL family ~300-400 at 512 px, MiniCPM-V ~64-96).
  Without this, Ollama's default context silently drops the start of the prompt (the frames)
  and the run "succeeds" with garbage.
- Final streamed chunk carries: `prompt_eval_count`, `eval_count`, `load_duration`,
  `prompt_eval_duration`, `eval_duration`, `total_duration` (all durations in nanoseconds).
  Map to `tokens_in_total`, `tokens_out`, `model_load_ms`, `model_ms`, `tokens_out_per_s`.
- Truncation check: if `prompt_eval_count < 0.8 * expected_prompt_tokens`, set
  `truncated_suspected = true`.
- `cold_start = load_duration > 1s` (model was loaded for this call). Warm up when the GPU lane
  switches model so timings compare fairly.
- `GET /api/ps` returns loaded models with `size_vram` (bytes) -> `model_vram_mb`.
- `POST /api/show {"model": tag}` returns `details` and the digest -> provenance.
- `GET /api/tags` lists pulled models (use for the "test connection" check).
- `GET /api/version` for the SDK/provenance record.

## OpenAI-compatible endpoints (llama.cpp, LM Studio, vLLM, OpenRouter)
`POST {base_url}/chat/completions` with content parts
`{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}` followed by a text part.
Pass `"stream": true, "stream_options": {"include_usage": true}` to get `usage` on the last chunk.
Presets: llama.cpp `http://127.0.0.1:8080/v1`, LM Studio `http://127.0.0.1:1234/v1`,
vLLM `http://127.0.0.1:8000/v1` (under WSL2; clashes with the playground port, move one),
OpenRouter `https://openrouter.ai/api/v1` (needs a key; some Qwen Flash models accept native video).
These are `models.yaml` rows on the one `openai_compat` provider; untested in v1.

## VRAM budget (8B-class, Q4 weights ~5.5GB, 16GB card)
| Sampling of a 90 s clip | Frames | Vision tokens | KV cache fp16 | KV cache q8 |
|---|---|---|---|---|
| 1 fps | 90 | ~21K | ~3 GB | ~1.5 GB |
| 2 fps | 180 | ~41K | ~5.8 GB | ~2.9 GB |
| 4 fps | 360 | ~83K | ~11.6 GB | ~5.8 GB |
16GB: 8B at Q4 and about 2 fps max with q8 KV cache. 24GB: 4 fps, or a 27B at Q4 with ~1 fps.
Frame rate matters more than parameter count for stroke mechanics.

Set for the Ollama service (user environment variables on Windows, then restart the tray app):
`OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_KEEP_ALIVE=30m`.
Optional `OLLAMA_MODELS` to move the ~25-35 GB of weights off the system drive.

## Shortlist (16GB)
| Ollama tag | Notes |
|---|---|
| `qwen3.5:9b` | best all-rounder, Apache-2.0, 262K ctx, ~6.6 GB |
| `minicpm-v4.5` | 96x video-token compression, tolerates many frames, 40K ctx, ~6.1 GB |
| `qwen3-vl:8b` | most mature tooling, documented fps/max_pixels knobs |
| `gemma4:12b` | strong; the 26B/31B variants cap video at 60 s (*unverified* for 12B) |
Skip for now: InternVL3.5 (32K ctx is too short for 180 frames), GLM-4.6V-Flash (card silent on
video, repo unmaintained). Multi-image support and max images per request vary by model: verify
with `model-scout` before enabling a row.

## Ball speed
No VLM can measure ball speed from 1-10 fps frames (a 100 km/h ball moves ~14 m between frames
at 2 fps). Any km/h in an output is a guess. Real speed is a phase-2 deliverable
(TrackNet ball detection + court homography at native frame rate).

## Measured on 2026-09-14 (Ollama 0.34, CPU-only Linux box, qwen3.5:2b)

- Reasoning models return hidden thinking in `message.thinking`; with the default `think` the 2B
  model burned all 1024 `num_predict` tokens thinking and returned an empty `content`
  (`done_reason: length`). The provider now sends `"think": false` unless `params.think: true`.
- 4 JPEG frames at 448 px cost 655 prompt tokens on qwen3.5:2b (~120 per frame), well under the
  350 per frame budgeted in `models.yaml`; the budget is conservative on purpose (bigger frames
  and models cost more).
- The 2B model confidently described a tennis player in a colour-bar test pattern; every Gemini
  model said there was no player. Hallucination on off-topic input is a useful quality check.
- `/api/ps` reported `size_vram` ≈ 2.3 GB even though this machine has no GPU, so treat
  `model_vram_mb` as Ollama's own claim, and rely on the NVML sampler for real VRAM deltas.
