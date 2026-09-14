#!/bin/sh
# Shared helper: read a dotted key from JSON on stdin. Uses jq when present,
# falls back to python3 so the hooks also work in Git Bash on Windows.
# Usage: json_get '.tool_input.file_path' < input.json
json_get() {
  if command -v jq >/dev/null 2>&1; then
    jq -r "$1 // empty"
  else
    python3 -c '
import json, sys
path = sys.argv[1].lstrip(".").split(".")
obj = json.load(sys.stdin)
for p in path:
    if not p:
        continue
    obj = obj.get(p) if isinstance(obj, dict) else None
    if obj is None:
        break
if isinstance(obj, str):
    sys.stdout.write(obj)
' "$1"
  fi
}
