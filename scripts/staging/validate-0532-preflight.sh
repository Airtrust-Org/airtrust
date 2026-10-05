#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0532 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count migration-ledger-0526 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0526_training_compliance_matrix_alignment.sql';"
assert_count migration-ledger-0532-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0532_training_compliance_fdm_designation_only.sql';"
assert_count fdm-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='FDM-EAD' AND ativo=1 AND deleted_at IS NULL;"
assert_count fdm-equipe-condition 1 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND UPPER(codigo)='FDM_EQUIPE' AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_FDM_DESIGNATION_ONLY_0532_STAGING_PREFLIGHT=PASS
