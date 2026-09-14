---
name: run-playground
description: How to start, seed and manually test the Tennis AI playground (backend, frontend, sample video, health check, logs, tests). Use when asked to run, start, smoke-test or screenshot the app.
---

# Run the playground

## Prerequisites
- `.env` exists (copy `.env.example`). `GEMINI_API_KEY` is needed for Gemini runs only.
- `ffmpeg` and `ffprobe` on PATH. `uv sync` done. `cd frontend && npm install` done.

## Backend
```bash
uv run playground --reload          # http://127.0.0.1:8000, API under /api
curl http://127.0.0.1:8000/api/health
```
Serves `frontend/dist` if it exists (SPA fallback to index.html). Logs go to stdout and to
`data/logs/` when running via `scripts/run.ps1` on the client PC.

## Frontend (dev)
```bash
cd frontend && npm run dev          # http://127.0.0.1:5173, proxies /api to :8000
```
For a production check: `cd frontend && npm run build` then open `http://127.0.0.1:8000`.

## Test video
```bash
mkdir -p data/samples
ffmpeg -y -f lavfi -i testsrc=duration=10:size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=440:duration=10 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac data/samples/test.mp4
```
Upload it through the Library page or `POST /api/videos` (multipart `file`).

## Seed data
- Prompts: `playground/prompts/seed.yaml` (loaded on first start).
- Models and frame presets: `playground/registry/models.yaml` (reload with
  `POST /api/models/reload`).
- Database: `data/playground.db` (SQLite, WAL). Inspect with `sqlite3 data/playground.db`.

## Tests
```bash
uv run pytest -q
uv run pytest -q tests/test_metrics_contract.py
```

## Manual smoke test
1. Upload the sample video, confirm thumbnail and playback.
2. New run: pick the video, a prompt version, `gemini-2.5-flash-lite`, preset "Quick". Launch.
3. Watch the SSE stream on the Run detail page, confirm tokens by modality and cost appear.
4. Rate the run. Open Dashboard and check the row aggregates.
5. Kill the server mid-run and restart: the run must show `interrupted`.

## Packaged app (desktop launcher)

- `uv run playground-desktop --no-tray --no-browser --port 8123` runs the same launcher the client
  gets, from the dev tree. `TENNISAI_HOME=/tmp/x` isolates its `.env` and `data/`.
- Freeze locally to validate the spec: `uv run pyinstaller --noconfirm --distpath build/dist
  --workpath build/work packaging/tennisai.spec`, then run `build/dist/TennisAI/TennisAI --no-tray
  --no-browser --port 8123` and curl `/api/settings` (expect `"packaged": true`).
- Mock models for UI work: `PLAYGROUND_MOCK=1 uv run playground`.

