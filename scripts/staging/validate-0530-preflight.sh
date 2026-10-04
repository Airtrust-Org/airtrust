#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0530 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_at_most_one(){ local label="$1" sql="$2" count; count="$(query_count "$sql")"; [[ "$count" == "0" || "$count" == "1" ]] || { echo "ERROR: $label expected=0-or-1 found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label:$count"; }
assert_count migration-ledger-0530-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0530_training_qualification_catalog_placeholders.sql';"
assert_count tenant-6 1 "SELECT COUNT(*) count FROM empresas WHERE id=6;"
assert_count canonical-ead-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(TRIM(codigo))='EAD';"
for code in REGRAS_OURO_PETROBRAS JUST_CULTURE STOP_WORK ETICA_CONDUTA LGPD_SEG_INFO; do
  assert_at_most_one "model-$code" "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL AND UPPER(codigo)=UPPER('$code');"
done
echo TRAINING_QUALIFICATION_CATALOG_0530_STAGING_PREFLIGHT=PASS
