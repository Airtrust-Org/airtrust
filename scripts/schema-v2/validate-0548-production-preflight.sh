#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNSUPPORTED_ARG" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "WRONG_D1_TARGET" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "0548_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }; echo "PASS:$name"; }
assert_count baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE'"
assert_count dependency-0547 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-regras-ouro-corporate-0547' AND baseline_id='production-d1-baseline-v2-20260714'"
assert_count unapplied-0548 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-maintenance-iio-aprs-assistants-0548'"
assert_count model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='MNT_IIO_APRS' AND ativo=1 AND deleted_at IS NULL"
assert_count assistant-role 1 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND nome='Auxiliar de Manutenção' AND ativo=1 AND deleted_at IS NULL"
assert_count six-active-assistants 6 "SELECT COUNT(*) count FROM funcionarios WHERE empresa_id=6 AND funcao_id=(SELECT id FROM funcoes WHERE empresa_id=6 AND nome='Auxiliar de Manutenção' AND ativo=1 AND deleted_at IS NULL) AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND UPPER(COALESCE(NULLIF(TRIM(status),''),'ATIVO'))='ATIVO'"
assert_count baseline-two-rules 2 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS' AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count existing-mechanic 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=6 WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS' AND f.nome='Mecânico' AND tr.escopo='FUNCAO' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL"
assert_count existing-engineering-coordinator 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=6 WHERE tr.empresa_id=6 AND qt.codigo='MNT_IIO_APRS' AND f.nome='Coordenador de Engenharia' AND tr.escopo='FUNCAO' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL"
echo 'TRAINING_COMPLIANCE_0548_PREFLIGHT=PASS'
