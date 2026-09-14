#!/bin/sh
# PreToolUse (Bash): refuse to stage or commit secrets and local data.
# Only the git add / git commit command segments are inspected, not heredoc bodies
# or unrelated parts of a compound command.
. "$(dirname "$0")/_json.sh"
cmd="$(json_get '.tool_input.command')"
[ -n "$cmd" ] || exit 0
# Split on ; | & and newlines, keep only segments that start with git add / git commit.
segments="$(printf '%s\n' "$cmd" | tr ';|&' '\n\n\n' | grep -E '^[[:space:]]*git[[:space:]]+(add|commit)([[:space:]]|$)')"
[ -n "$segments" ] || exit 0
stripped="$(printf '%s' "$segments" | sed 's/\.env\.example//g')"
if printf '%s' "$stripped" | grep -Eq '(^|[^A-Za-z0-9_.-])\.env([^A-Za-z0-9_-]|$)|(^|[[:space:]/])data/|\.db([[:space:]]|$)'; then
  echo "Blocked: this git command references .env, data/ or a .db file. Those must never be committed." >&2
  exit 2
fi
exit 0
