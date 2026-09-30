#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0520 postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0520 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0520_training_compliance_evidence_multi_profiles.sql';"
assert_count relation-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico_perfis_competencia';"
assert_count unique-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='uq_qh_perfil_competencia_ativo';"
assert_count lookup-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_qh_perfis_empresa_historico';"
assert_count tenant-trigger 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_qh_perfil_competencia_tenant_0520';"
assert_count orphan-relations 0 "SELECT COUNT(*) count FROM qualificacoes_historico_perfis_competencia qhp LEFT JOIN qualificacoes_historico qh ON qh.id=qhp.historico_id AND qh.empresa_id=qhp.empresa_id WHERE qhp.deleted_at IS NULL AND (qh.id IS NULL OR qh.deleted_at IS NOT NULL);"
assert_count missing-0519-backfill 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND qh.perfil_competencia IS NOT NULL AND TRIM(qh.perfil_competencia)<>'' AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico_perfis_competencia qhp WHERE qhp.empresa_id=qh.empresa_id AND qhp.historico_id=qh.id AND qhp.perfil_competencia=UPPER(TRIM(qh.perfil_competencia)) AND qhp.deleted_at IS NULL);"
assert_count duplicate-active-profile 0 "SELECT COUNT(*) count FROM (SELECT empresa_id,historico_id,perfil_competencia,COUNT(*) total FROM qualificacoes_historico_perfis_competencia WHERE deleted_at IS NULL GROUP BY empresa_id,historico_id,perfil_competencia HAVING COUNT(*)>1);"
echo TRAINING_COMPLIANCE_EVIDENCE_MULTI_PROFILES_0520_STAGING_POSTCONDITIONS=PASS
