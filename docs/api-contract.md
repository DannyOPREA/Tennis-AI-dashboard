# Playground API contract (v1)

Base path `/api`. JSON everywhere except file endpoints. All ids are integers. Timestamps ISO-8601 UTC.
The backend binds `127.0.0.1:8000`; the Vite dev server proxies `/api` to it.

## Health
- `GET /api/health` → `{ status: "ok", host: string, gemini_configured: bool, ollama_url: string|null, ollama_reachable: bool, gpu: { available: bool, name: string|null, vram_total_mb: int|null } }`

## Videos
- `GET /api/videos` → `Video[]`
- `POST /api/videos` multipart: `file` (mp4/mov/webm), optional `title`, `tags` (comma-separated) → `Video` (201). Transcodes a playback copy and thumbnail; de-duplicates by sha256 (returns existing, 200).
- `GET /api/videos/{id}` → `Video`
- `PATCH /api/videos/{id}` `{ title?, tags? }` → `Video`
- `DELETE /api/videos/{id}` → 204 (refused with 409 if runs exist)
- `GET /api/videos/{id}/file` → `video/mp4` playback copy, supports Range
- `GET /api/videos/{id}/thumbnail` → `image/jpeg`

```ts
type Video = {
  id: number; title: string; filename: string; sha256: string;
  duration_s: number; fps: number; width: number; height: number; size_bytes: number;
  has_audio: boolean; tags: string[]; uploaded_at: string;
  thumbnail_url: string; file_url: string; run_count: number;
}
```

## Prompts
- `GET /api/prompts` → `Prompt[]`
- `POST /api/prompts` `{ name, notes?, system_text, user_text, output_language }` → `Prompt` (creates version 1)
- `PATCH /api/prompts/{id}` `{ name?, notes? }` → `Prompt`
- `POST /api/prompts/{id}/versions` `{ system_text, user_text, output_language }` → `Prompt` (new version appended; versions are immutable)

```ts
type PromptVersion = { id: number; prompt_id: number; version: number; system_text: string; user_text: string; output_language: "fr"|"en"; created_at: string; run_count: number }
type Prompt = { id: number; name: string; notes: string; created_at: string; versions: PromptVersion[]; latest_version_id: number }
```

## Models and presets
- `GET /api/models` → `ModelConfig[]`
- `POST /api/models/reload` → `ModelConfig[]` (re-reads `models.yaml`)
- `GET /api/frame-presets` → `FramePreset[]`

```ts
type ModelConfig = {
  id: string; display_name: string; provider: "gemini"|"ollama"|"openai_compat"; model_id: string;
  base_url: string|null; input_modes: ("native_video"|"frames")[]; params: Record<string, unknown>;
  tokens_per_frame: number; max_images: number|null; prices: Prices; vram_note: string|null;
  licence: string|null; notes: string|null; enabled: boolean;
  availability: { available: boolean; reason: string|null }  // e.g. "GEMINI_API_KEY not set", "not pulled in Ollama", "Ollama unreachable"
}
type Prices = { text_in: number; image_in: number; video_in: number; audio_in: number; cached_in: number; out: number; source_url?: string; valid_from?: string }
type FramePreset = { key: string; label: string; description: string; fps: number; long_edge: number; max_frames: number; jpeg_quality: number }
```

## Estimates and batches
- `POST /api/estimate` `{ video_id, prompt_version_id, targets: Target[], frame_preset }` → `Estimate[]`
- `POST /api/batches` `{ name?, video_id, prompt_version_id, targets: Target[], frame_preset, repeats?: number (default 1), blind?: boolean }` → `Batch` (201) with runs queued
- `GET /api/batches?limit=50` → `BatchSummary[]` newest first
- `GET /api/batches/{id}` → `Batch` (with full `runs`)
- `GET /api/batches/{id}/export` → JSON download of batch, runs, ratings, video and prompt metadata

```ts
type Target = { model_config_id: string; input_mode: "native_video"|"frames" }
type Estimate = { model_config_id: string; input_mode: string; frames: number; est_tokens_in: number; est_cost_usd: number; exact: boolean; warnings: string[] }
type BatchSummary = { id: number; name: string; created_at: string; video_id: number; video_title: string; prompt_version_id: number; prompt_name: string; prompt_version: number; frame_preset: string; repeats: number; blind: boolean; counts: Record<RunStatus, number>; run_count: number }
type Batch = BatchSummary & { runs: Run[] }
```

## Runs
- `GET /api/runs?video_id&model_config_id&status&limit=100` → `Run[]`
- `GET /api/runs/{id}` → `Run`
- `POST /api/runs/{id}/cancel` → `Run`
- `POST /api/runs/{id}/retry` → `Run` (new run in the same batch)
- `GET /api/runs/{id}/frames` → `{ count: number; contact_sheet_url: string|null; frames: { index: number; t: number; url: string }[] }` (empty for native_video)
- `GET /api/runs/{id}/frames/{index}` → `image/jpeg`
- `GET /api/runs/{id}/contact-sheet` → `image/jpeg` (tiled overview)
- `GET /api/runs/{id}/events` → SSE. Events: `status` `{ status, stage, message }`, `delta` `{ text }` (partial output), `done` `{ run: Run }`, `error` `{ message }`. Closes after done/error.
- `GET /api/events` → SSE global stream: `run` `{ run_id, batch_id, status, stage }` on every status change.

```ts
type RunStatus = "queued"|"running"|"done"|"error"|"interrupted"|"cancelled"
type Run = {
  id: number; batch_id: number; repeat_index: number; video_id: number; prompt_version_id: number;
  model_config_id: string; model_label: string; provider: string; model_snapshot: ModelConfig;
  input_mode: "native_video"|"frames"; frame_preset: string; frame_plan: FramePreset|null; frame_plan_hash: string|null;
  host: string; status: RunStatus; stage: string|null; created_at: string; started_at: string|null; finished_at: string|null;
  output_text: string|null; error: string|null; retries: number;
  metrics: {
    upload_ms: number|null; extract_ms: number|null; model_load_ms: number|null; ttft_ms: number|null; model_ms: number|null; total_ms: number|null;
    cold_start: boolean; cache_hit: boolean;
    tokens_in_total: number|null; tokens_in_text: number|null; tokens_in_image: number|null; tokens_in_video: number|null; tokens_in_audio: number|null; tokens_in_cached: number|null;
    tokens_out: number|null; tokens_thinking: number|null; truncated_suspected: boolean;
    frames_sent: number|null; video_seconds_sent: number|null; output_chars: number|null; output_words: number|null; tokens_out_per_s: number|null;
    cost_api_usd: number|null; gpu_seconds: number|null; gpu_energy_wh: number|null; cost_energy_usd: number|null; gpu_peak_vram_delta_mb: number|null; model_vram_mb: number|null;
    model_version: string|null; sdk_versions: Record<string,string>|null;
  };
  raw_usage: Record<string, unknown>|null; request_summary: Record<string, unknown>|null;
  rating: Rating|null; video_title: string; prompt_name: string; prompt_version: number; blind: boolean;
}
```

## Ratings
- `PUT /api/runs/{id}/rating` `{ stars: 1..5, notes?: string, rater?: string (default "client") }` → `Rating` (upsert per run+rater)
- `DELETE /api/runs/{id}/rating?rater=client` → 204

```ts
type Rating = { id: number; run_id: number; rater: string; stars: number; notes: string; blind: boolean; created_at: string; updated_at: string }
```

## Dashboard
- `GET /api/dashboard/filters` → `{ prompts: {id,name}[]; videos: {id,title}[]; hosts: string[]; presets: string[]; models: {id, display_name}[] }`
- `GET /api/dashboard/summary?prompt_id&video_id&host&frame_preset&include_cold=false&rater=client` → `SummaryRow[]` (only `done` runs; cold-start runs excluded unless include_cold)
- `GET /api/dashboard/runs?same filters` → `PointRow[]` for scatter charts (done runs)

```ts
type SummaryRow = {
  key: string; model_config_id: string; display_name: string; provider: string; input_mode: string; frame_preset: string;
  n: number; n_rated: number; stars_mean: number|null; stars_min: number|null; stars_max: number|null;
  model_ms_median: number|null; model_ms_min: number|null; model_ms_max: number|null; ttft_ms_median: number|null; total_ms_median: number|null;
  tokens_in_mean: number|null; tokens_out_mean: number|null; tokens_thinking_mean: number|null; tokens_out_per_s_mean: number|null;
  cost_api_usd_mean: number|null; cost_api_usd_total: number|null; cost_energy_usd_mean: number|null;
  gpu_peak_vram_delta_mb_max: number|null; model_vram_mb: number|null; truncated_count: number; error_count: number;
}
type PointRow = { run_id: number; batch_id: number; model_config_id: string; display_name: string; provider: string; input_mode: string; frame_preset: string; video_id: number; stars: number|null; cost_api_usd: number|null; model_ms: number|null; ttft_ms: number|null; tokens_in_total: number|null; tokens_out: number|null; cold_start: boolean }
```

## Errors
`{ detail: string }` with 400/404/409/422/503. 503 when a provider is not configured (e.g. missing Gemini key).

## Settings and setup (added for the client-facing install)

Configuration is edited from the UI and persisted to the app's env file (`.env` in the project during
development, `%LOCALAPPDATA%\TennisAI\.env` in the packaged Windows app). Changes take effect
immediately, no restart.

- `GET /api/settings` → `Settings`
- `PUT /api/settings` `{ gemini_api_key?: string, ollama_url?: string, host_name?: string, energy_price_per_kwh?: number }` → `Settings`. Pass an empty string to clear a value. The key is never returned, only a hint.
- `POST /api/settings/test-gemini` `{ gemini_api_key?: string }` (uses the saved key when omitted) → `{ ok: boolean, message: string, models: string[] }` — makes one tiny text call; `models` lists the registry's Gemini ids reachable with this key.

```ts
type Settings = {
  gemini_key_set: boolean; gemini_key_hint: string|null;  // e.g. "…k3Qz"
  ollama_url: string; host_name: string; energy_price_per_kwh: number;
  data_dir: string; env_file: string; packaged: boolean; version: string;
}
```

- `GET /api/setup` → `SetupStatus` — drives the first-run flow. The frontend shows `/welcome` while `complete` is false (the user can skip; skipping is remembered in localStorage).

```ts
type SetupStatus = { gemini_key_set: boolean; gemini_ok: boolean|null; ollama_reachable: boolean; ollama_version: string|null; models_available: number; models_total_local: number; videos: number; gpu: { available: boolean; name: string|null; vram_total_mb: number|null }; complete: boolean }
```

- `GET /api/ollama/status` → `{ reachable: boolean; version: string|null; url: string; installed: OllamaModel[]; disk_free_gb: number|null; models_dir: string|null }`
- `POST /api/ollama/pull` `{ model_config_id: string }` → `PullJob` (202) — starts a background download of that registry row's Ollama tag; idempotent while running.
- `GET /api/ollama/pulls` → `PullJob[]` (poll every second while any job is `pulling`)
- `DELETE /api/ollama/pull/{model_config_id}` → 204 cancels a running pull
- `DELETE /api/ollama/models/{model_config_id}` → 204 removes the downloaded model from Ollama

```ts
type OllamaModel = { name: string; size_bytes: number; modified_at: string; model_config_id: string|null }
type PullJob = { model_config_id: string; tag: string; status: "pulling"|"done"|"error"|"cancelled"; completed_bytes: number; total_bytes: number|null; percent: number|null; message: string; started_at: string; finished_at: string|null }
```

`GET /api/models` availability now also reports `"downloading"` as a reason while a pull is running.
