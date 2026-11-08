#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[[ "${1:---target=airtrust-db}" == '--target=airtrust-db' ]] || { echo 'WRONG_D1_TARGET' >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute airtrust-db --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{let a=JSON.parse(s);let n=Number(a[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "0575_CHECK_FAILED:$name expected=$expected actual=$n" >&2; exit 1; }; echo "PASS:$name"; }
assert_count baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE'"
assert_count 0548-applied 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-maintenance-iio-aprs-assistants-0548'"
assert_count model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND id=127 AND codigo='MNT_IIO_APRS' AND ativo=1 AND deleted_at IS NULL"
assert_count six-assistants 6 "SELECT COUNT(*) count FROM funcionarios WHERE empresa_id=6 AND funcao_id=38 AND deleted_at IS NULL AND COALESCE(ativo,1)=1 AND UPPER(COALESCE(NULLIF(TRIM(status),''),'ATIVO'))='ATIVO'"
assert_count mechanic-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE id=198 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=5 AND obrigatoriedade='OBRIGATORIA' AND ativo=1 AND deleted_at IS NULL"
assert_count coordinator-preserved-inactive 1 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE id=199 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=39 AND ativo=0 AND deleted_at IS NOT NULL"
assert_count assistant-auto-enrollment-disabled 1 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE id=704 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND obrigatoriedade='OBRIGATORIA' AND auto_matricular_ead=0"
assert_count unapplied 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-iio-aprs-assistant-restore-0575'"
assert_count assistant-inactive 1 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE id=704 AND empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND ativo=0 AND deleted_at IS NOT NULL"
assert_count no-active-assistant 0 "SELECT COUNT(*) count FROM treinamento_requisitos WHERE empresa_id=6 AND qualificacao_tipo_id=127 AND funcao_id=38 AND ativo=1 AND deleted_at IS NULL"
echo "SCHEMA_0575_PREFLIGHT=PASS"
