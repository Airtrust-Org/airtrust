#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNSUPPORTED_ARG" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "WRONG_D1_TARGET" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "0547_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }; echo "PASS:$name"; }
assert_count dependency-0546 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-canonical-category-repair-0546' AND baseline_id='production-d1-baseline-v2-20260714'"
assert_count applied-0547 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-regras-ouro-corporate-0547' AND baseline_id='production-d1-baseline-v2-20260714'"
assert_count mandatory-all-roles 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND tr.escopo='EMPRESA' AND tr.funcao_id IS NULL AND tr.setor_id IS NULL AND tr.funcionario_id IS NULL AND tr.condicao_id IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND tr.auto_matricular_ead=1 AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count no-duplicates 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='REGRAS_OURO_PETROBRAS' AND tr.ativo=1 AND tr.deleted_at IS NULL"
echo "TRAINING_COMPLIANCE_0547_POSTCONDITIONS=PASS"
