#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0516 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0515 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0515_qualification_expiry_email_stages.sql';"
assert_count migration-ledger-0516 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0516_qualification_expired_daily_alerts.sql';"
assert_count configurable-columns 5 "SELECT COUNT(*) count FROM pragma_table_info('notificacoes_config') WHERE name IN ('empresa_id','codigo','assunto_template','frequencia','intervalo_dias');"
assert_count tenant-config-indexes 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_notificacoes_config_empresa','uq_notificacoes_config_tenant_codigo_tipo');"
assert_count pre-expiry-global-stages 4 "SELECT COUNT(*) count FROM notificacoes_config WHERE empresa_id IS NULL AND tipo='EMAIL' AND codigo IN ('QUALIFICACAO_45D','QUALIFICACAO_30D','QUALIFICACAO_15D','QUALIFICACAO_7D') AND ativo=1 AND deleted_at IS NULL;"
assert_count expired-daily-global-stage 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE empresa_id IS NULL AND tipo='EMAIL' AND codigo='QUALIFICACAO_VENCIDA' AND ativo=1 AND frequencia='DAILY' AND intervalo_dias=1 AND deleted_at IS NULL;"
assert_count corrected-30d-wording 1 "SELECT COUNT(*) count FROM notificacoes_config WHERE empresa_id IS NULL AND tipo='EMAIL' AND codigo='QUALIFICACAO_30D' AND template LIKE '%entrou no período de vencimento%' AND deleted_at IS NULL;"
echo QUALIFICATION_EXPIRED_DAILY_ALERTS_0516_STAGING_POSTCONDITIONS=PASS
