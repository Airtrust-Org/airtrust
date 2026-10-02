#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0526 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_zero_or_one(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" == "0" || "$count" == "1" ]] || { echo "ERROR: $label expected=0-or-1 found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label:$count"; }
assert_count dependency-0524 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0524_training_compliance_requirement_sanitization.sql';"
assert_count migration-ledger-0526-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0526_training_compliance_matrix_alignment.sql';"
for code in D2 PRE NR-11 NR-20 NR-26 NR-35 AVSEC_CONSC; do
  assert_count "model-$code" 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)=UPPER('$code') AND deleted_at IS NULL;"
done
assert_count loft-model-record 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='LOFT';"
assert_count comandante-function 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome)='Comandante';"
assert_count copiloto-function 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome)='Copiloto';"
assert_count mechanic-function 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome) IN ('Mecânico','Mecanico','MECÂNICO','MECANICO');"
assert_count maintenance-assistant-function 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome) IN ('Aux Manutenção','Aux Manutencao','Auxiliar de Manutenção','Auxiliar de Manutencao');"
assert_count supplies-assistant-function 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome) IN ('Aux Suprimentos','Auxiliar de Suprimentos');"
assert_count supplies-supervisor-function 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome) IN ('Supervisor Suprimentos','Supervisor de Suprimentos');"
for code in FDM_ADMIN FDM_COMITE LOSA_ANALISTA EDB_LOGBOOK_USUARIO GESTAO_MUDANCAS_PARTICIPANTE; do
  assert_zero_or_one "condition-$code" "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND codigo='$code' AND ativo=1 AND deleted_at IS NULL;"
done
echo TRAINING_COMPLIANCE_MATRIX_ALIGNMENT_0526_STAGING_PREFLIGHT=PASS
