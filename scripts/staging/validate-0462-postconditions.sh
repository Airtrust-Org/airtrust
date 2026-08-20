#!/usr/bin/env bash
# Read-only staging proof for 0462. Rollback is RESTORE_REQUIRED because a
# later global-unique index could reject legitimate cross-tenant codes.
set -euo pipefail
DB='airtrust-db-staging-baseline-20260701'
[[ "${1:-}" == "--target=$DB" ]] || { echo 'ERROR: staging target required' >&2; exit 1; }
run() { (cd worker-airtrust && npx wrangler d1 execute "$DB" --remote --json --command "$1") | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d)[0]?.results??[])))'; }
test "$(run "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_tipos_codigo_empresa_active'" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.n??0)))')" = 1
test "$(run "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_tipos_codigo'" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.n??0)))')" = 0
test "$(run "SELECT COUNT(*) n FROM (SELECT empresa_id, codigo FROM qualificacoes_tipos WHERE deleted_at IS NULL GROUP BY empresa_id, codigo COLLATE NOCASE HAVING COUNT(*) > 1)" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.n??0)))')" = 0
echo POSTCONDITIONS_OK
