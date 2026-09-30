#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0519 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count migration-ledger-0519-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0519_training_compliance_evidence_profiles.sql';"
assert_count d1-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='D1' AND deleted_at IS NULL;"
assert_count d4-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='D4' AND deleted_at IS NULL;"
assert_count funcionarios-funcao-column 1 "SELECT COUNT(*) count FROM pragma_table_info('funcionarios') WHERE name='funcao';"
assert_count qh-profile-column-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_historico') WHERE name='perfil_competencia';"
assert_count lms-profile-column-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('lms_matriculas') WHERE name='perfil_competencia';"
assert_count profile-trigger-absent 0 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_qh_profile_from_evidence_source_0519';"
echo TRAINING_COMPLIANCE_EVIDENCE_PROFILES_0519_STAGING_PREFLIGHT=PASS
