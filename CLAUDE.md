# Tennis AI: Model Playground

Internal evaluation tool for a French tennis client. A tennis video is run through several
models (Gemini Flash via API, open-weight vision models running locally on the client's
Windows PC with a 16GB RTX 4080), every output is saved with measured cost / latency / token
stats, the client rates outputs 1-5 stars, and a dashboard compares models so he can pick
one for the future coaching app. See `docs/api-contract.md` for the API (source of truth)
and `.claude/skills/` for provider and design details.

## Stack

- Backend: Python 3.13 (`.python-version`), FastAPI, SQLModel + SQLite (WAL), `uv`.
- Providers: `google-genai` for Gemini (native video and frames), Ollama native `/api/chat`,
  generic OpenAI-compatible client (llama.cpp, LM Studio, vLLM, OpenRouter).
- Video: `ffmpeg` / `ffprobe` CLI. GPU stats via `nvidia-ml-py` (no-op without NVIDIA).
- Frontend: Vite + React + TypeScript, Tailwind v4, shadcn/ui, Recharts, react-router-dom,
  react-markdown. Formatter/linter: Biome.
- Dev machine is Linux without a GPU: only Gemini runs here. Local models run on the client PC.

## Commands

```bash
uv run playground               # API + built frontend on http://127.0.0.1:8000
uv run playground --reload      # backend dev mode
cd frontend && npm run dev      # Vite on http://127.0.0.1:5173, proxies /api to :8000
uv run pytest                   # backend tests
cd frontend && npm run build    # writes frontend/dist (committed: the client PC has no Node)
cd frontend && npx biome check --write .
uv run ruff format && uv run ruff check --fix
uv run playground-desktop --no-tray  # the packaged entry point (server + browser + tray)
uv run pyinstaller --noconfirm --distpath build/dist --workpath build/work packaging/tennisai.spec
```

## Packaging for the client (Windows)

- `.github/workflows/release.yml` builds `TennisAI-Setup-<version>.exe` on a Windows runner when a
  `v*` tag is pushed (or manually via workflow_dispatch): frontend build, PyInstaller freeze of
  `playground/desktop.py` with `frontend/dist`, `models.yaml`, `seed.yaml` and a downloaded ffmpeg,
  a headless smoke test of the frozen exe, then Inno Setup (`packaging/TennisAI.iss`).
- Packaged layout: read-only resources under `sys._MEIPASS`; writable home
  `%LOCALAPPDATA%\TennisAI` (`.env`, `data/`). `TENNISAI_HOME` overrides the home (tests set it).
  `playground/config.py` owns these paths; never hard-code `PROJECT_ROOT` for runtime files.
- All client configuration happens in the UI (Settings and Welcome pages) through
  `/api/settings`, `/api/setup` and `/api/ollama/*`. Mock models exist only with `PLAYGROUND_MOCK=1`.
- Bump `APP_VERSION` in `playground/config.py` and tag `vX.Y.Z` to release. The PowerShell scripts in
  `scripts/` are the manual fallback, not the client path.

Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. Hooks in `.claude/hooks/` format edited
files and block staging `.env`, `data/` or `.db` files.

## Conventions

- Code, comments, commit messages and UI copy are English. Model output is French, driven by
  the prompt version's `output_language`. All UI strings live in `frontend/src/i18n/en.ts`.
- Gemini is called only through `google-genai`. Never litellm: it silently drops `video_url`.
- Local models receive ffmpeg-extracted JPEG frames as image parts. Ollama and LM Studio do not
  accept video. Gemini also has a `frames` input mode so comparisons can be like for like.
- Record measured token usage from provider responses, never estimates. Cost is
  `sum(modality tokens x snapshot prices)`. Every run stores an immutable `model_snapshot`
  (config + prices) and references an immutable prompt version.
- `playground/registry/models.yaml` is the single source of truth for models and frame presets.
  `scripts/pull-models.ps1` reads Ollama tags from it. Verify a model with the `model-scout`
  agent before adding a row.
- Bind to `127.0.0.1` only. Never commit `.env` or `data/`.

## Concurrency model

- `async def` endpoints. ffmpeg through `asyncio.create_subprocess_exec`. Gemini through
  `client.aio`. HTTP through async `httpx` (read timeout `None` for generation calls).
- Database access uses short synchronous SQLModel sessions run via `run_in_threadpool`.
  SQLite runs in WAL mode with `busy_timeout`. Never hold a session across an await.
- Progress and partial text live in memory and are streamed over SSE. The database is written
  only on status changes.
- Two-lane queue started in the app lifespan: GPU lane (sequential, local models) and API lane
  (semaphore of 3, hosted models). Each run has a wall-clock timeout and can be cancelled.
  On startup any `running` or `queued` run is marked `interrupted`.

## Gotchas

- Ollama's default `num_ctx` silently truncates long prompts. Compute
  `frames x tokens_per_frame + text + margin`, send it in `options`, and flag
  `truncated_suspected` when `prompt_eval_count` is below expectation.
- Gemini thinking tokens are billed as output tokens and cannot be fully disabled on 3.x
  Flash. Only 2.5 Flash / Flash-Lite honour `thinking_budget=0`.
- Requests over 20 MB total must use the Gemini Files API, not inline bytes.
- iPhone HEVC `.mov` files do not play in Chrome. Ingest transcodes an H.264 playback copy
  and keeps the original for the models. Serve video with Range support, never as a static mount.
- No vision model can measure ball speed from sampled frames. Gemini's km/h figures are
  guesses. Real speed needs the phase-2 CV pipeline (TrackNet + court homography).
- VRAM is consumed by frame tokens, not weights: an 8B model at Q4 on 16GB tops out around
  2 fps over 90 s (~180 frames). Frame presets encode this budget.
