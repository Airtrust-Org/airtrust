#!/usr/bin/env bash
# Read-only staging proof for the 0461 schema. Session revocation is
# intentionally FORWARD_ONLY; recovery is the verified backup/Time Travel path.
set -euo pipefail
DB='airtrust-db-staging-baseline-20260701'
[[ "${1:-}" == "--target=$DB" ]] || { echo 'ERROR: staging target required' >&2; exit 1; }
run() { (cd worker-airtrust && npx wrangler d1 execute "$DB" --remote --json --command "$1") | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d)[0]?.results??[])))'; }
test "$(run "SELECT COUNT(*) n FROM pragma_table_info('refresh_tokens') WHERE name='empresa_id' AND upper(type)='INTEGER' AND \"notnull\"=0" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.n??0)))')" = 1
test "$(run "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='idx_refresh_tokens_empresa' AND sql LIKE '%ON refresh_tokens(empresa_id)%'" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.n??0)))')" = 1
echo POSTCONDITIONS_OK
