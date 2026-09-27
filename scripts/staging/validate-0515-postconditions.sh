#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0515 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0515_qualification_expiry_email_stages.sql';"
assert_count qualification-email-45d 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE tipo='EMAIL' AND ativo=1 AND dias_antes=45 AND COALESCE(urgencia,'')='low' AND deleted_at IS NULL;"
assert_count qualification-email-30d 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE tipo='EMAIL' AND ativo=1 AND dias_antes=30 AND COALESCE(urgencia,'')='medium' AND deleted_at IS NULL;"
assert_count corrected-30d-wording 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE tipo='EMAIL' AND dias_antes=30 AND COALESCE(urgencia,'')='medium' AND template LIKE '%entrou no período de vencimento%' AND deleted_at IS NULL;"
echo QUALIFICATION_EXPIRY_EMAIL_STAGES_0515_STAGING_POSTCONDITIONS=PASS
