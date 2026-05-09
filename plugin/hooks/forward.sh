#!/bin/bash
RUNTIME="${CLAUDE_PLUGIN_DATA}/runtime.json"
[ -f "$RUNTIME" ] || exit 0

PORT=$(jq -r '.port' "$RUNTIME" 2>/dev/null) || exit 0
TOKEN=$(jq -r '.token' "$RUNTIME" 2>/dev/null) || exit 0
PAYLOAD=$(cat -)
EVENT=$(echo "$PAYLOAD" | jq -r '.hook_event_name' 2>/dev/null) || exit 0

echo "$PAYLOAD" | curl -sf --max-time 5 \
  -X POST "http://127.0.0.1:${PORT}/hooks/${EVENT}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- > /dev/null 2>&1 &

exit 0
