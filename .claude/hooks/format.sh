#!/bin/sh
# PostToolUse (Edit|Write|MultiEdit): format the touched file in place.
# Silent on success, never fails the tool call.
. "$(dirname "$0")/_json.sh"
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
f="$(json_get '.tool_input.file_path')"
[ -n "$f" ] || exit 0
[ -f "$f" ] || exit 0
case "$f" in
  *.py)
    (cd "$ROOT" && uv run ruff format -q "$f" && uv run ruff check --fix -q "$f") >/dev/null 2>&1
    ;;
  *.ts|*.tsx)
    BIOME="$ROOT/frontend/node_modules/.bin/biome"
    if [ -x "$BIOME" ]; then
      (cd "$ROOT/frontend" && "$BIOME" check --write "$f") >/dev/null 2>&1
    fi
    ;;
esac
exit 0
