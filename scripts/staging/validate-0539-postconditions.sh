#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0539 postcondition refused target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=d.indexOf('['),e=d.lastIndexOf(']');const p=JSON.parse(s>=0?d.slice(s,e+1):d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0539 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0539_training_doutrinacao_bootstrap.sql';"
assert_count canonical-doutrinacao 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO' AND ativo=1 AND deleted_at IS NULL AND validade=36 AND carga_horaria=4 AND carga_horaria_inicial=8 AND carga_horaria_recorrente=4 AND referencias LIKE '%PRG-MNT-002%Programa de Treinamento de Manutenção Rev.06%';"
assert_count canonical-doutrinacao-total 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='MNT_INTEGRACAO_DOUTRINACAO';"
bash scripts/staging/validate-0536-postconditions.sh --target="$target"
echo TRAINING_DOUTRINACAO_BOOTSTRAP_0539_STAGING_POSTCONDITIONS=PASS
