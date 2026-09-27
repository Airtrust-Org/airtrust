#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="qualification-expired-daily-alerts-0516"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0516 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_min_count(){ local label="$1" minimum="$2" sql="$3" count; count="$(query_count "$sql")"; (( count >= minimum )) || { echo "ERROR: $label minimum=$minimum found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label count=$count"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
for col in empresa_id codigo assunto_template frequencia intervalo_dias; do assert_count "notificacoes_config-$col" 1 "SELECT COUNT(*) count FROM pragma_table_info('notificacoes_config') WHERE name='$col';"; done
assert_min_count email-30-corrected 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE empresa_id IS NULL AND tipo='EMAIL' AND codigo='QUALIFICACAO_30D' AND ativo=1 AND template LIKE '%entrou no período de vencimento%' AND deleted_at IS NULL;"
assert_min_count email-expired-daily-active 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE empresa_id IS NULL AND tipo='EMAIL' AND codigo='QUALIFICACAO_VENCIDA' AND ativo=1 AND frequencia='DAILY' AND template LIKE '%dias_vencida%' AND deleted_at IS NULL;"
assert_count tenant-code-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='uq_notificacoes_config_tenant_codigo_tipo';"
echo QUALIFICATION_EXPIRED_DAILY_ALERTS_0516_PRODUCTION_POSTCONDITIONS=PASS
