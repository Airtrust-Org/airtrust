#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: production 0535 preflight refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count dependency-0534 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-final-matrix-0534' AND baseline_id='$BASELINE_ID';"
assert_count unapplied-0535 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-integra-bootstrap-0535';"
assert_count canonical-ead-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND UPPER(TRIM(codigo))='EAD' AND ativo=1 AND deleted_at IS NULL;"
integra_count="$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='INTEGRA' AND ativo=1 AND deleted_at IS NULL;")"
[[ "$integra_count" == "0" || "$integra_count" == "1" ]] || { echo "ERROR: INTEGRA active identities must be 0 or 1; found=$integra_count" >&2; exit 1; }
echo "PREFLIGHT_OK=integra-active-identities-$integra_count"
echo TRAINING_COMPLIANCE_INTEGRA_BOOTSTRAP_0535_PRODUCTION_PREFLIGHT=PASS
