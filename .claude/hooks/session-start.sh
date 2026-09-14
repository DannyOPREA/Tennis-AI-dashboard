#!/bin/sh
# SessionStart: short status summary. Never prints secret values.
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT" || exit 0
echo "== Tennis AI playground =="
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  changes="$(git status --short 2>/dev/null | head -20)"
  if [ -n "$changes" ]; then echo "git status:"; echo "$changes"; else echo "git: clean"; fi
fi
if [ -f .env ]; then
  if grep -Eq '^GEMINI_API_KEY=[[:space:]]*[^[:space:]]+' .env; then
    echo "GEMINI_API_KEY: set"
  else
    echo "GEMINI_API_KEY: not set (Gemini runs will fail)"
  fi
  ollama_url="$(grep -E '^OLLAMA_URL=' .env | head -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'')"
  if [ -n "$ollama_url" ]; then
    if curl -s -m 2 "$ollama_url/api/version" >/dev/null 2>&1; then
      echo "Ollama: reachable at $ollama_url"
    else
      echo "Ollama: unreachable at $ollama_url"
    fi
  fi
else
  echo ".env: missing (copy .env.example)"
fi
exit 0
