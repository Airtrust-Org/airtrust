#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo UNKNOWN_ARGUMENT >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo RETIF_0587_DB_MISMATCH >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),n=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(n)||n<0)process.exit(1);console.log(n);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "RETIF_0587_POSTCHECK_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "CHECK_OK=$name"; }
assert_count ledger-0587 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='simuladores-fichas-retificacoes-0587' AND baseline_id='production-d1-baseline-v2-20260714' AND file_hash='0454d6b153a48adc542d8066c2615b1890f22c4fa6b1a368d60f159a45de4e95' AND plan_hash='72370963c42a07e95f627109651409cd3e32c7dcebf999909cb56b45cb6ce69d'"
assert_count retificacoes-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='fichas_sessao_retificacoes'"
assert_count retificacoes-itens-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='fichas_sessao_retificacoes_itens'"
assert_count triggers-append-only 6 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_fichas_retificacoes%'"
assert_count open-unique-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name='uq_fichas_retificacoes_aberta_por_ficha'"
assert_count retificacoes-empty 0 "SELECT COUNT(*) count FROM fichas_sessao_retificacoes"
assert_count fk-integrity 0 "SELECT COUNT(*) count FROM pragma_foreign_key_check"
echo RETIF_0587_POSTCONDITIONS_PASS
