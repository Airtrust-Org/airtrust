#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; CHANGE_ID="training-compliance-evidence-profiles-0519"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0519 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count qh-profile-column 1 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_historico') WHERE name='perfil_competencia';"
assert_count lms-profile-column 1 "SELECT COUNT(*) count FROM pragma_table_info('lms_matriculas') WHERE name='perfil_competencia';"
assert_count qh-profile-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_qh_empresa_func_tipo_perfil';"
assert_count lms-profile-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='idx_lms_matriculas_empresa_func_perfil';"
assert_count profile-trigger 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name='trg_qh_profile_from_evidence_source_0519';"
PILOT="UPPER(TRIM(COALESCE(f.funcao,''))) IN ('COMANDANTE','COPILOTO')"
assert_count pilot-d1-unprofiled 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL AND UPPER(qt.codigo)='D1' AND $PILOT AND COALESCE(qh.perfil_competencia,'')<>'AVSEC_TRIPULANTE';"
assert_count pilot-d4-unprofiled 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL AND UPPER(qt.codigo)='D4' AND $PILOT AND COALESCE(qh.perfil_competencia,'')<>'PTAP_TRIPULANTE_VOO';"
assert_count nonpilot-d1-misprofiled 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL AND UPPER(qt.codigo)='D1' AND qh.perfil_competencia='AVSEC_TRIPULANTE' AND NOT ($PILOT);"
assert_count nonpilot-d4-misprofiled 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id AND qt.empresa_id=qh.empresa_id JOIN funcionarios f ON f.id=qh.funcionario_id AND f.empresa_id=qh.empresa_id WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL AND UPPER(qt.codigo)='D4' AND qh.perfil_competencia='PTAP_TRIPULANTE_VOO' AND NOT ($PILOT);"
echo TRAINING_COMPLIANCE_EVIDENCE_PROFILES_0519_PRODUCTION_POSTCONDITIONS=PASS
