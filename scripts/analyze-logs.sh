#!/usr/bin/env bash

set -euo pipefail

# Analisa logs do Cloudflare Workers sem expor PII por padrao.
# Uso:
#   AIRTRUST_ALLOW_PROD_TAIL=YES ./scripts/analyze-logs.sh [filtro] [rotulo_minutos]
#   ./scripts/analyze-logs.sh [filtro] [rotulo_minutos] --status-only

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  AIRTRUST_ALLOW_PROD_TAIL=YES ./scripts/analyze-logs.sh [FILTER] [MINUTES_LABEL]
  ./scripts/analyze-logs.sh [FILTER] [MINUTES_LABEL] --status-only

Notes:
  - Requires AIRTRUST_ALLOW_PROD_TAIL=YES before opening a production log stream.
  - --status-only is read-only and does not open wrangler tail.
  - Output is sanitized and does not print userEmail, message or error bodies by default.
EOF
  exit 0
fi

FILTER="${1:-ERROR}"
MINUTES_LABEL="${2:-60}"
MODE="${3:-}"

if [[ "$MODE" == "--status-only" ]]; then
  echo "status=ready"
  echo "filter=$FILTER"
  echo "minutes_label=$MINUTES_LABEL"
  echo "prod_tail_gate=${AIRTRUST_ALLOW_PROD_TAIL:-NO}"
  echo "note=wrangler_tail_is_streaming_only"
  exit 0
fi

if [[ "${AIRTRUST_ALLOW_PROD_TAIL:-}" != "YES" ]]; then
  echo "❌ Production tail blocked. Set AIRTRUST_ALLOW_PROD_TAIL=YES in an approved ops window." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq nao encontrado no PATH." >&2
  exit 1
fi

FILTER_UPPER="$(printf '%s' "$FILTER" | tr '[:lower:]' '[:upper:]')"

echo "=== AIRTRUST LOG STREAM ==="
echo "filter=$FILTER_UPPER"
echo "minutes_label=$MINUTES_LABEL"
echo "note=wrangler tail only streams new logs; historical lookback is not available in this script."
echo "note=raw message and error bodies are suppressed to reduce accidental PII/secret exposure."
echo

wrangler tail --env production --format=json | jq -r --arg filter "$FILTER_UPPER" '
  select(((.level // "") | ascii_upcase) == $filter) |
  [
    "[" + (.context.timestamp // "timestamp-unavailable") + "]",
    "[" + (.level // "UNKNOWN") + "]",
    "module=" + (.context.module // "unknown"),
    "request_id=" + (.context.requestId // "n/a"),
    "duration_ms=" + ((.duration // "n/a") | tostring),
    "message_present=" + (if .message then "yes" else "no" end),
    "error_present=" + (if .error and .error.message then "yes" else "no" end)
  ] | join(" ")
  ,
  "---"
' | head -n 200
