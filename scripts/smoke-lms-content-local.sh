#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${AIRTRUST_LOCAL_API_BASE:-http://localhost:8787/api}"
LOGIN_EMAIL="${AIRTRUST_LOCAL_LMS_EMAIL:-admin@airtrust.com}"
LOGIN_PASSWORD="${AIRTRUST_LOCAL_LMS_PASSWORD:-Admin@123}"
PDF_FIXTURE="${AIRTRUST_LMS_PDF_FIXTURE:-$ROOT_DIR/fixtures/lms/offshore-demo.pdf}"
DB_PATH="${AIRTRUST_LOCAL_DB_PATH:-}"

if [[ -z "$DB_PATH" ]]; then
  DB_PATH="$(find "$ROOT_DIR/worker-airtrust/.wrangler/state" -path '*miniflare-D1DatabaseObject/*.sqlite' | head -n 1)"
fi

if [[ -z "$DB_PATH" || ! -f "$DB_PATH" ]]; then
  echo "Local D1 database not found." >&2
  exit 1
fi

sql() {
  sqlite3 "$DB_PATH" "$1"
}

json_get() {
  local path="$1"
  node -e '
    const path = process.argv[1].split(".");
    let raw = "";
    process.stdin.on("data", (chunk) => (raw += chunk));
    process.stdin.on("end", () => {
      const parsed = JSON.parse(raw);
      let cursor = parsed;
      for (const key of path) cursor = cursor?.[key];
      if (cursor === undefined || cursor === null) process.exit(1);
      process.stdout.write(String(cursor));
    });
  ' "$path"
}

extract_env_value() {
  local output="$1"
  local key="$2"
  printf '%s\n' "$output" | awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' | tail -n 1
}

assert_non_empty() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" ]]; then
    echo "Missing expected value: $label" >&2
    exit 1
  fi
}

echo "[smoke:lms] Checking local API"
curl -fsS "$API_BASE/health" >/dev/null

echo "[smoke:lms] Authenticating"
LOGIN_RESPONSE="$(curl -fsS -X POST "$API_BASE/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$LOGIN_EMAIL\",\"senha\":\"$LOGIN_PASSWORD\"}")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | json_get data.accessToken)"
assert_non_empty "$TOKEN" "access token"

echo "[smoke:lms] Seeding PDF flow"
PDF_OUTPUT="$(bash "$ROOT_DIR/scripts/seed-lms-pdf-demo.sh" "$PDF_FIXTURE")"
PDF_CURSO_ID="$(extract_env_value "$PDF_OUTPUT" CURSO_ID)"
PDF_MATRICULA_ID="$(extract_env_value "$PDF_OUTPUT" MATRICULA_ID)"
assert_non_empty "$PDF_CURSO_ID" "pdf curso id"
assert_non_empty "$PDF_MATRICULA_ID" "pdf matricula id"

echo "[smoke:lms] Seeding PPTX flow"
PPTX_OUTPUT="$(bash "$ROOT_DIR/scripts/seed-lms-pptx-demo.sh")"
PPTX_CURSO_ID="$(extract_env_value "$PPTX_OUTPUT" CURSO_ID)"
PPTX_MATRICULA_ID="$(extract_env_value "$PPTX_OUTPUT" MATRICULA_ID)"
PPTX_SLIDE_COUNT="$(extract_env_value "$PPTX_OUTPUT" SLIDE_COUNT)"
assert_non_empty "$PPTX_CURSO_ID" "pptx curso id"
assert_non_empty "$PPTX_MATRICULA_ID" "pptx matricula id"
assert_non_empty "$PPTX_SLIDE_COUNT" "pptx slide count"

echo "[smoke:lms] Validating protected assets"
curl -fsS "$API_BASE/lms/pdf/asset/$PDF_CURSO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -o /dev/null

PPTX_HEADERS="$(mktemp)"
trap 'rm -f "$PPTX_HEADERS"' EXIT
curl -fsS "$API_BASE/lms/pptx/asset/$PPTX_CURSO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -D "$PPTX_HEADERS" \
  -o /dev/null

HEADER_SLIDE_COUNT="$(awk -F': ' 'tolower($1) == "x-pptx-slide-count" { gsub(/\r/, "", $2); print $2 }' "$PPTX_HEADERS" | tail -n 1)"
if [[ "$HEADER_SLIDE_COUNT" != "$PPTX_SLIDE_COUNT" ]]; then
  echo "Unexpected PPTX slide count header: expected $PPTX_SLIDE_COUNT, got ${HEADER_SLIDE_COUNT:-<empty>}" >&2
  exit 1
fi

echo "[smoke:lms] Persisting progress before end-user completion"
curl -fsS -X PATCH "$API_BASE/lms/matriculas/$PDF_MATRICULA_ID/progresso" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"progresso_pct":100}' >/dev/null

curl -fsS -X PATCH "$API_BASE/lms/matriculas/$PPTX_MATRICULA_ID/progresso" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"progresso_pct":100}' >/dev/null

finalize_requires_server_evidence() {
  local matricula_id="$1"
  local label="$2"
  local body_file
  local http_code
  local code

  body_file="$(mktemp)"
  http_code="$(curl -sS -o "$body_file" -w '%{http_code}' -X POST "$API_BASE/lms/matriculas/$matricula_id/finalizar" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{}')"

  if [[ "$http_code" != "409" ]]; then
    echo "$label finalization should fail closed with HTTP 409; got $http_code." >&2
    cat "$body_file" >&2
    rm -f "$body_file"
    exit 1
  fi

  code="$(json_get code < "$body_file")"
  if [[ "$code" != "CONTENT_EVIDENCE_REQUIRED" ]]; then
    echo "$label finalization returned unexpected code: $code" >&2
    cat "$body_file" >&2
    rm -f "$body_file"
    exit 1
  fi

  rm -f "$body_file"
}

echo "[smoke:lms] Confirming qualifying non-SCORM content fails closed without server evidence"
finalize_requires_server_evidence "$PDF_MATRICULA_ID" "PDF"
finalize_requires_server_evidence "$PPTX_MATRICULA_ID" "PPTX"

echo "[smoke:lms] Checking that no qualification linkage was created in local D1"
PDF_ROW="$(sql "SELECT status || '|' || COALESCE(CAST(qualificacao_historico_id AS TEXT), '') FROM lms_matriculas WHERE id = $PDF_MATRICULA_ID LIMIT 1;")"
PPTX_ROW="$(sql "SELECT status || '|' || COALESCE(CAST(qualificacao_historico_id AS TEXT), '') FROM lms_matriculas WHERE id = $PPTX_MATRICULA_ID LIMIT 1;")"

PDF_STATUS="${PDF_ROW%%|*}"
PDF_HISTORICO_ID="${PDF_ROW#*|}"
PPTX_STATUS="${PPTX_ROW%%|*}"
PPTX_HISTORICO_ID="${PPTX_ROW#*|}"

if [[ "$PDF_STATUS" == "CONCLUIDO" || -n "$PDF_HISTORICO_ID" ]]; then
  echo "PDF flow created qualification without server-validated evidence." >&2
  echo "$PDF_OUTPUT"
  exit 1
fi

if [[ "$PPTX_STATUS" == "CONCLUIDO" || -n "$PPTX_HISTORICO_ID" ]]; then
  echo "PPTX flow created qualification without server-validated evidence." >&2
  echo "$PPTX_OUTPUT"
  exit 1
fi

echo "[smoke:lms] OK — qualifying PDF/PPTX remain unqualified without server evidence"
echo "PDF_CURSO_ID=$PDF_CURSO_ID"
echo "PDF_MATRICULA_ID=$PDF_MATRICULA_ID"
echo "PPTX_CURSO_ID=$PPTX_CURSO_ID"
echo "PPTX_MATRICULA_ID=$PPTX_MATRICULA_ID"