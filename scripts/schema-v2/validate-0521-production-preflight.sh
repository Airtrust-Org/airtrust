#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-compliance-designation-overrides-0521"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0521 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count dependency-0517 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-conditions-0517';"
assert_count dependency-0518 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='crm-qualification-consolidation-0518';"
assert_count conditions-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='compliance_condicoes';"
assert_count assignments-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='funcionarios_compliance_condicoes';"
assert_count crm-corp-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_CORP' AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-dir-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_DIR_RBAC119' AND ativo=1 AND deleted_at IS NULL;"
assert_count rbac119-designations-before 0 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND codigo LIKE 'RBAC119_%' AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_DESIGNATION_OVERRIDES_0521_PRODUCTION_PREFLIGHT=PASS
