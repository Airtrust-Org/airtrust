#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0520 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count dependency-0519 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0519_training_compliance_evidence_profiles.sql';"
assert_count migration-ledger-0520-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0520_training_compliance_evidence_multi_profiles.sql';"
assert_count qh-profile-column 1 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_historico') WHERE name='perfil_competencia';"
assert_count relation-table-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico_perfis_competencia';"
assert_count tenant-trigger-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_qh_perfil_competencia_tenant_0520';"
echo TRAINING_COMPLIANCE_EVIDENCE_MULTI_PROFILES_0520_STAGING_PREFLIGHT=PASS
