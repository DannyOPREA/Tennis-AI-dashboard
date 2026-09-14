# Claude Code setup for this project

- `settings.json`: enabled plugins (project scope), permission allow/deny lists, env
  (`ENABLE_STOP_REVIEW=0` turns off security-guidance's per-turn LLM diff review; commit
  review stays on) and hooks.
- `hooks/format.sh`: PostToolUse, runs ruff on `.py` and Biome on `.ts/.tsx` after edits.
- `hooks/guard-secrets.sh`: PreToolUse on Bash, blocks staging or committing
  `.env`, `data/` or `.db` files.
- `hooks/session-start.sh`: prints git status, whether `GEMINI_API_KEY` is set and Ollama
  reachability (only when `OLLAMA_URL` is set).
- `skills/`: `gemini-video`, `local-vlm`, `playground-design`, `run-playground`.
- `agents/`: `ui-reviewer` (Playwright screenshots + design critique), `model-scout`
  (verifies a model before it enters `models.yaml`).

## Prerequisites

```bash
npm i -g typescript typescript-language-server   # typescript-lsp plugin (user scope, installed)
npx playwright install chromium                  # playwright MCP plugin
export CONTEXT7_API_KEY=...                      # optional, raises context7 rate limits
```

Plugins installed at project scope: frontend-design, context7, playwright, security-guidance,
commit-commands. `pyright-lsp` and `typescript-lsp` are installed at user scope.
