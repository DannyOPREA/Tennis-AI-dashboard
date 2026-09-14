---
name: gemini-video
description: How to send video to the Gemini API with google-genai in this project. Model ids, pricing with sources, Files API vs inline, exact token counting, media resolution, fps, thinking settings per model family, per-modality usage, streaming. Use when writing or debugging playground/providers/gemini.py, pricing, or Gemini cost estimates.
---

# Gemini video with `google-genai`

Verified against ai.google.dev on 2026-09-14 unless marked *unverified*. SDK: `google-genai`
2.x (pin `<3`). Use the stable `generate_content` path, not the beta Interactions API.

## Model ids and prices (USD per 1M tokens, paid tier)

| Model | Input (text/image/video) | Output incl. thinking | Notes |
|---|---|---|---|
| `gemini-3.8-flash` | 0.75 (1.50 from 2027-01-01) | 3.75 (7.50 from 2027-01-01) | newest stable |
| `gemini-3.7-flash` | 0.75 (1.50 from 2027-01-01) | 3.75 (7.50) | |
| `gemini-3.6-flash` | 0.75 (1.50 from 2027-01-01) | 3.75 (7.50) | consumer app "Flash" reportedly maps here (*unverified*) |
| `gemini-3.5-flash` | 1.50 | 9.00 | legacy pricing, higher than 3.8 |
| `gemini-3.5-flash-lite` | 0.30 | 2.50 | supports agentic media processing |
| `gemini-3.1-flash-lite` | 0.25 (audio 0.50) | 1.50 | |
| `gemini-2.5-flash` | 0.30 (audio 1.00) | 2.50 | thinking can be turned off |
| `gemini-2.5-flash-lite` | 0.10 (audio 0.30) | 0.40 | cheapest; thinking can be turned off |

Sources: https://ai.google.dev/gemini-api/docs/models and https://ai.google.dev/gemini-api/docs/pricing.
Batch and Flex tiers are 50% off. Store prices in `models.yaml` with `source_url` and `valid_from`;
cost is always computed from measured usage.

Free tier: content is used to improve Google products and rate limits are dynamic (visible only in
AI Studio). Recommend the paid tier for the client: videos show an identifiable child.

## Upload rules
- Total request (video + prompt) under 20 MB: inline `Part(inline_data=Blob(...))` is allowed.
  Above that, the Files API is mandatory (docs table says 100 MB but the prose says 20 MB; use 20).
- Files API limit: 2 GB per file (free) / 20 GB (paid). Files expire after 48 h. Cache
  `gemini_file_uri` and `gemini_file_expires_at` on the Video row and re-upload when expired.
- Formats: mp4, mpeg, mov, avi, x-flv, mpg, webm, wmv, 3gpp.
- One video per request. Put the text prompt AFTER the video part.

```python
import asyncio
from google import genai
from google.genai import types

client = genai.Client()  # reads GEMINI_API_KEY

async def upload(path: str) -> types.File:
    f = await client.aio.files.upload(file=path)
    while f.state is None or f.state.name != "ACTIVE":
        await asyncio.sleep(2)
        f = await client.aio.files.get(name=f.name)
    return f
```

## Token counting
The docs disagree on default video cost (video-understanding page: ~300 tokens/s at default,
~100 at low; media-resolution page for Gemini 3: 70 tokens/frame at low/medium, 280 at high).
Never estimate from these. Use the exact, free pre-launch count:

```python
resp = await client.aio.models.count_tokens(
    model=model_id,
    contents=[types.Part.from_uri(file_uri=f.uri, mime_type=f.mime_type), prompt_text],
)
resp.total_tokens
```

After a run, read `response.usage_metadata`:
- `prompt_token_count`, `candidates_token_count`, `thoughts_token_count`, `cached_content_token_count`
- `prompt_tokens_details`: list of `ModalityTokenCount(modality, token_count)` with modality in
  TEXT / IMAGE / VIDEO / AUDIO / DOCUMENT. Persist each as `tokens_in_<modality>`.
- `candidates_tokens_details`, `tool_use_prompt_tokens_details` exist too.
- `response.model_version` gives the exact served model; store it in provenance.

## Media resolution and fps
```python
config = types.GenerateContentConfig(
    media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW,   # LOW | MEDIUM | HIGH | UNSPECIFIED
    thinking_config=...,
)
video_part = types.Part(
    file_data=types.FileData(file_uri=f.uri, mime_type=f.mime_type),
    video_metadata=types.VideoMetadata(fps=2, start_offset="0s", end_offset="90s"),
)
```
For video, LOW and MEDIUM are identical on Gemini 3 (70 tokens/frame). Gemini 3 allows per-part
`media_resolution`. `media_processing="AGENTIC"` on the part (3.6+ Flash, 3.5 Flash-Lite) lets
the model navigate long video for far fewer tokens; token accounting then lands in
`thoughts_token_count` and `tool_use_prompt_token_count`. Not needed for 30-90 s clips.

## Thinking
- Thinking tokens are billed at the output price on every model.
- 2.5 Flash and 2.5 Flash-Lite: `types.ThinkingConfig(thinking_budget=0)` disables thinking.
- 3.x: `types.ThinkingConfig(thinking_level="low" | "medium" | "high")`. `minimal` raises an
  error on 3.7 and 3.8 Flash. Full thinking-off is not supported on 3.x Flash / Flash-Lite.
- Put the chosen setting in the model's `params` in `models.yaml` and copy it into the run's
  `model_snapshot`.

## Streaming (TTFT and partial text)
```python
t0 = time.perf_counter(); first = None; text = []
async for chunk in await client.aio.models.generate_content_stream(
    model=model_id, contents=[video_part, prompt_text], config=config
):
    if chunk.text:
        first = first or time.perf_counter()
        text.append(chunk.text)
        progress(chunk.text)
    usage = chunk.usage_metadata or usage   # final chunk carries the full usage
ttft_ms = (first - t0) * 1000 if first else None
```
TTFT includes thinking time when thinking is on. Record `ttft_ms = NULL` when not streaming.

## Frames mode (fairness baseline)
Send the same JPEG frames used for local models as `types.Part.from_bytes(data=jpeg, mime_type="image/jpeg")`
parts followed by the prompt text. Usage then reports IMAGE tokens instead of VIDEO/AUDIO.
Keep the request under 20 MB or upload frames through the Files API.

## Errors worth handling
- 429 on free tier: back off and mark the run `error`, do not retry silently more than twice.
- `FAILED` file state after upload: re-upload once, then fail the run.
- Safety blocks: `response.prompt_feedback.block_reason`; store in `error`.
