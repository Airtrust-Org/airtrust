#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"

STAMP="${1:-$(date +%Y%m%d)}"
OUTPUT_SQL="$ROOT_DIR/docs/controlled-execution/schema-baseline-pre0412-${STAMP}.sql"
OUTPUT_REPORT="$ROOT_DIR/docs/controlled-execution/schema-baseline-pre0412-${STAMP}-report.md"

mkdir -p "$(dirname "$OUTPUT_SQL")"

fail() {
  echo "[schema-only-export] FAIL: $*" >&2
  exit 1
}

command -v jq >/dev/null 2>&1 || fail "jq_not_found"
command -v perl >/dev/null 2>&1 || fail "perl_not_found"
command -v shasum >/dev/null 2>&1 || fail "shasum_not_found"

tmp_json="$(mktemp)"
tmp_sql="$(mktemp)"
cleanup() {
  rm -f "$tmp_json" "$tmp_sql"
}
trap cleanup EXIT

QUERY=$(cat <<'SQL'
SELECT type, name, sql
FROM sqlite_master
WHERE sql IS NOT NULL
  AND type IN ('table', 'index', 'view')
  AND name NOT LIKE 'sqlite_%'
  AND name NOT LIKE '_cf_%'
  AND name <> 'd1_migrations'
  AND name NOT LIKE '\_backup%' ESCAPE '\'
  AND name NOT LIKE '%\_tmp' ESCAPE '\'
  AND name NOT LIKE 'tmp_%'
  AND name NOT LIKE 'temp_%'
  AND name NOT LIKE 'bkp_%'
  AND name NOT LIKE '%\_old' ESCAPE '\'
  AND name NOT LIKE 'legacy_%'
  AND name <> 'schema_versions'
  AND name <> '_data_recovery_log'
  AND name <> 'migracao_log'
  AND name <> 'migracao_mapeamento_ids'
ORDER BY
  CASE type
    WHEN 'table' THEN 1
    WHEN 'index' THEN 2
    WHEN 'view' THEN 3
    ELSE 4
  END,
  name;
SQL
)

# ── Suspicious objects manifest (narrow patterns only) ──────────────────────
SUSPICIOUS_NAMES="name LIKE 'bkp_%' OR name LIKE '%_backup%' OR name LIKE '%_tmp' OR name LIKE 'tmp_%' OR name LIKE 'temp_%' OR name LIKE '%_old' OR name LIKE 'legacy_%' OR name = 'schema_versions' OR name = '_data_recovery_log' OR name = 'migracao_log' OR name = 'migracao_mapeamento_ids' OR name = '_backup_qh_tmp'"
SUSPICIOUS_QUERY="SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' AND ($SUSPICIOUS_NAMES) ORDER BY type, name;"

(
  cd "$WORKER_DIR"
  npx wrangler d1 execute airtrust-db \
    --env production \
    --remote \
    --command "$QUERY" \
    --json
) > "$tmp_json"

jq -r '.[0].results[].sql + ";"' "$tmp_json" > "$tmp_sql"
perl -0pi -e 's/\n{3,}/\n\n/g' "$tmp_sql"
perl -pi -e 's/[ \t]+$//' "$tmp_sql"

if grep -Eiq '\b(INSERT|UPDATE|DELETE|REPLACE|UPSERT|DROP)\b' "$tmp_sql"; then
  fail "prohibited_dml_or_drop_detected"
fi

if grep -Eiq 'd1_migrations|_cf_' "$tmp_sql"; then
  fail "internal_tables_detected"
fi

mv "$tmp_sql" "$OUTPUT_SQL"
trap cleanup EXIT

tables="$(jq -r '.[0].results | map(select(.type == "table")) | length' "$tmp_json")"
indexes="$(jq -r '.[0].results | map(select(.type == "index")) | length' "$tmp_json")"
triggers="$(jq -r '.[0].results | map(select(.type == "trigger")) | length' "$tmp_json")"
views="$(jq -r '.[0].results | map(select(.type == "view")) | length' "$tmp_json")"
total="$(jq -r '.[0].results | length' "$tmp_json")"
sha256="$(shasum -a 256 "$OUTPUT_SQL" | awk '{print $1}')"

cat > "$OUTPUT_REPORT" <<EOF
# Schema Baseline Pre-0412 Report

- Source: production D1 schema via read-only \`sqlite_master\` query
- Database: \`airtrust-db\`
- Database ID: \`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae\`
- Environment: \`production\` read-only
- Output SQL: \`$OUTPUT_SQL\`
- SHA256: \`$sha256\`

## Commands Used

\`\`\`bash
cd worker-airtrust
npx wrangler d1 execute airtrust-db --env production --remote --command "<sqlite_master schema query>" --json
\`\`\`

## Object Counts

- Total DDL objects: $total
- Tables: $tables
- Indexes: $indexes
- Triggers: $triggers
- Views: $views

## Exclusions Applied

- Excluded \`d1_migrations\`
- Excluded \`_cf_%\`
- Excluded names matching \`_backup%\`
- Excluded names matching \`%_tmp\`, \`tmp_%\`, \`temp_%\`
- Excluded names matching \`bkp_%\`
- Excluded names matching \`%_old\`
- Excluded names matching \`legacy_%\`
- Excluded \`schema_versions\`, \`_data_recovery_log\`, \`migracao_log\`, \`migracao_mapeamento_ids\`
- Excluded all triggers to avoid embedded DML in trigger bodies (TODO: add trigger support with per-body DML validation)
- Excluded all non-DDL because source query only reads \`sqlite_master.sql\`

## Validation Proofs

- No \`INSERT\`, \`UPDATE\`, \`DELETE\`, \`REPLACE\`, \`UPSERT\`, or \`DROP\` statements detected
- No \`d1_migrations\` reference detected
- No \`_cf_%\` object detected
- No table rows exported; source limited to schema text in \`sqlite_master\`
- No production data values exported by design

## Pending Improvements (TODO)

- [ ] Include triggers in baseline (requires per-body DML validation to avoid false positives from the grep check)
- [ ] Validate that excluded objects are not referenced by canonical objects (dependency check)
- [ ] Detect FK that points to nonexistent table (warn, don't fail)

## Notes

- This artifact is pre-0412 by execution policy, not by schema rollback. It reflects the current production schema as DDL-only.
- Triggers were inventoried in production separately but intentionally excluded from the baseline file.
- Human review is still required before applying the baseline to a new staging D1.

## Excluded Suspicious Objects Manifest

EOF

# ── Suspicious objects report ──────────────────────────────────────
if [[ -n "${SUSPICIOUS_QUERY:-}" ]]; then
  suspicious_tmp="$(mktemp)"
  (
    cd "$WORKER_DIR"
    npx wrangler d1 execute airtrust-db \
      --env production \
      --remote \
      --command "$SUSPICIOUS_QUERY" \
      --json
  ) > "$suspicious_tmp" 2>/dev/null || true

  suspicious_count="$(jq -r '.[0].results | length // 0' "$suspicious_tmp" 2>/dev/null || echo "0")"
  cat >> "$OUTPUT_REPORT" <<EOF
- **Found $suspicious_count** object(s) matching suspicious naming patterns.
- See \`docs/SCHEMA_OBJECT_CANONICALITY_AUDIT_20260701.md\` for canonicality classification.
- **Review required** before approving baseline.
EOF

  jq -r '.[0].results[] | "- **\(.type)**: `\(.name)`" // empty' "$suspicious_tmp" 2>/dev/null >> "$OUTPUT_REPORT" || true
  rm -f "$suspicious_tmp"
else
  cat >> "$OUTPUT_REPORT" <<EOF
No suspicious objects query defined in this version of the script.
EOF
fi

echo ""

echo "SCHEMA_ONLY_EXPORT=COMPLETED"
echo "OUTPUT_SQL=$OUTPUT_SQL"
echo "OUTPUT_REPORT=$OUTPUT_REPORT"
echo "SHA256=$sha256"
