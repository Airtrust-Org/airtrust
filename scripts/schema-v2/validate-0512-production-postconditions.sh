#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="qualification-areas-0512"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0512 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count qualification-areas-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='qualificacoes_areas';"
assert_count qualification-area-column 1 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_tipos') WHERE name='area_id';"
assert_count qualification-area-indexes 3 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_qualificacoes_areas_codigo_active','idx_qualificacoes_areas_nome_active','idx_qualificacoes_tipos_empresa_area');"
assert_count qualification-area-tenant-triggers 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_qualificacoes_tipos_area_tenant_insert','trg_qualificacoes_tipos_area_tenant_update');"
tenant6="$(query_count "SELECT COUNT(*) count FROM empresas WHERE id=6;")"
expected_seed=$(( tenant6 * 4 ))
assert_count initial-area-catalog "$expected_seed" "SELECT COUNT(*) count FROM qualificacoes_areas WHERE empresa_id=6 AND deleted_at IS NULL AND codigo IN ('OPERACOES','MANUTENCAO','QSMS','SEGURANCA_OPERACIONAL');"
assert_count cross-tenant-area-links 0 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_areas qa ON qa.id=qt.area_id WHERE qt.area_id IS NOT NULL AND qt.empresa_id<>qa.empresa_id;"
echo QUALIFICATION_AREAS_0512_PRODUCTION_POSTCONDITIONS=PASS
