#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="qualification-expired-daily-alerts-0516"; DEPENDENCY_ID="qualification-expiry-email-stages-0515"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0516 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count dependency-0515-applied 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$DEPENDENCY_ID';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count notification-config-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='notificacoes_config';"
for col in tipo ativo dias_antes urgencia destinatarios template deleted_at; do assert_count "notificacoes_config-$col" 1 "SELECT COUNT(*) count FROM pragma_table_info('notificacoes_config') WHERE name='$col';"; done
for col in empresa_id codigo assunto_template frequencia intervalo_dias; do assert_count "notificacoes_config-$col-not-yet-present" 0 "SELECT COUNT(*) count FROM pragma_table_info('notificacoes_config') WHERE name='$col';"; done
echo QUALIFICATION_EXPIRED_DAILY_ALERTS_0516_PRODUCTION_PREFLIGHT=PASS
