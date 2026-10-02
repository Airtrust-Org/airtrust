#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="setor-compliance-responsibles-0527"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0527 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID' AND baseline_id='$BASELINE_ID';"
assert_count target-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='setores_responsaveis_compliance';"
assert_count target-indexes 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_setores_resp_compliance_setor','idx_setores_resp_compliance_funcionario');"
assert_count tenant-triggers 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_setores_resp_compliance_tenant_insert','trg_setores_resp_compliance_tenant_update');"
assert_count cross-tenant-links 0 "SELECT COUNT(*) count FROM setores_responsaveis_compliance src LEFT JOIN setores s ON s.id=src.setor_id AND s.empresa_id=src.empresa_id LEFT JOIN funcionarios f ON f.id=src.funcionario_id AND f.empresa_id=src.empresa_id WHERE s.id IS NULL OR f.id IS NULL;"
echo SETOR_COMPLIANCE_RESPONSIBLES_0527_PRODUCTION_POSTCONDITIONS=PASS
