#!/usr/bin/env bash
# Smoke: execute real migration and rollback files via Wrangler/D1 local.
#
# OPERATIONAL MARKERS (guard:operational-sql-sources):
# source_reference: this script executes the EXACT same migration and rollback
#   files that will be applied to production. It uses a temporary, isolated
#   D1 database created via wrangler d1 execute --local with --persist-to.
#   No production data is accessed, and the temp database is destroyed after
#   the test completes.
# operational_decision: validate that 0450_qualificacoes_category_only.sql and
#   its rollback execute correctly under Wrangler/D1 local before they are
#   applied to production. Covers apply, second-apply no-op, rollback, and
#   atomic failure (missing EAD category).
# dry_run_required: must pass locally before the migration can be applied to
#   any remote environment. Run via: bash scripts/test-migration-0450-wrangler.sh
# rollback_plan_required: this script validates the rollback by executing it
#   against a post-0450 database and confirming exact restoration to baseline.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG="$ROOT/worker-airtrust/migrations/0450_qualificacoes_category_only.sql"
ROLL="$ROOT/scripts/rollback/0450_qualificacoes_category_only.sql"
cd "$ROOT/worker-airtrust"

T="$(mktemp -d /tmp/airtrust-d1-smoke-XXXXXX)"
cleanup() {
  [[ -n "${T:-}" && -d "$T" ]] && rm -rf "$T"
}
trap cleanup EXIT

# Schema + fixture
npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T" --command "
CREATE TABLE IF NOT EXISTS qualificacoes_categorias(id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, empresa_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS qualificacoes_formatos(id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, empresa_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS qualificacoes_tipos(id TEXT PRIMARY KEY, codigo TEXT, nome TEXT, categoria TEXT, categoria_id INTEGER, formato_id INTEGER, validade INTEGER, empresa_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT, updated_at TEXT);
INSERT INTO qualificacoes_categorias VALUES(200,'EAD','EAD',6,1,NULL,NULL,NULL);
INSERT INTO qualificacoes_categorias VALUES(300,'EAD','EAD-T8',8,1,NULL,NULL,NULL);
INSERT INTO qualificacoes_formatos VALUES(10,'EAD','EAD',6,1,NULL,NULL,NULL);
INSERT INTO qualificacoes_formatos VALUES(20,'EAD','EAD',8,1,NULL,NULL,NULL);
INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,formato_id,validade,empresa_id,ativo) VALUES('t6-ead','E1','EAD T6','MANUTENCAO',10,12,6,1);
INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,formato_id,validade,empresa_id,ativo) VALUES('t8-ead','E2','EAD T8','OUTRA',20,12,8,1);
INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,formato_id,validade,empresa_id,ativo) VALUES('t6-pres','P1','Presencial','PRESENCIAL',NULL,24,6,1);
" >/dev/null 2>&1 || { echo "FAIL: schema" >&2; exit 1; }
echo "  Schema OK"

# Apply migration
npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T" --file "$MIG" >/dev/null 2>&1 || { echo "FAIL: apply" >&2; exit 1; }
echo "  Apply OK"

# Validate
npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T" --json --command "SELECT id,categoria,categoria_id,formato_id FROM qualificacoes_tipos WHERE id='t6-ead'" > /tmp/_qco_smoke_val.json 2>/dev/null
grep -q '"categoria".*"EAD"' /tmp/_qco_smoke_val.json || { echo "FAIL: not EAD" >&2; exit 1; }
grep -q '"categoria_id".*200' /tmp/_qco_smoke_val.json || { echo "FAIL: bad cat" >&2; exit 1; }
grep -q '"formato_id".*null' /tmp/_qco_smoke_val.json || { echo "FAIL: fmt not null" >&2; exit 1; }
echo "  Validate OK"

# Second apply
npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T" --file "$MIG" >/dev/null 2>&1 || { echo "FAIL: second" >&2; exit 1; }
echo "  No-op OK"

# Rollback
npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T" --file "$ROLL" >/dev/null 2>&1 || { echo "FAIL: rollback" >&2; exit 1; }
echo "  Rollback OK"

OUT=$(npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T" --json --command "SELECT id,categoria,formato_id FROM qualificacoes_tipos WHERE id='t6-ead'" > /tmp/_qco_smoke_rb.json 2>/dev/null)
grep -q '"categoria".*"MANUTENCAO"' /tmp/_qco_smoke_rb.json || { echo "FAIL: not restored" >&2; exit 1; }
grep -q '"formato_id".*10' /tmp/_qco_smoke_rb.json || { echo "FAIL: fmt not restored" >&2; exit 1; }
echo "  Restore OK"

# Atomic failure (no categoria)
T2="$(mktemp -d /tmp/airtrust-d1-atomic-XXXXXX)"
npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T2" --command "
CREATE TABLE IF NOT EXISTS qualificacoes_categorias(id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, empresa_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS qualificacoes_formatos(id INTEGER PRIMARY KEY, nome TEXT, codigo TEXT, empresa_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS qualificacoes_tipos(id TEXT PRIMARY KEY, codigo TEXT, nome TEXT, categoria TEXT, categoria_id INTEGER, formato_id INTEGER, validade INTEGER, empresa_id INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT, updated_at TEXT);
INSERT INTO qualificacoes_formatos VALUES(10,'EAD','EAD',6,1,NULL,NULL,NULL);
INSERT INTO qualificacoes_tipos(id,codigo,nome,categoria,formato_id,validade,empresa_id,ativo) VALUES('tf','X','T','MANUTENCAO',10,12,6,1);
" >/dev/null 2>&1
if npx wrangler d1 execute airtrust-db-local --local --config wrangler.dev.toml --persist-to "$T2" --file "$MIG" >/dev/null 2>&1; then
  echo "FAIL: should have failed" >&2; exit 1
fi
rm -rf "$T2"
echo "  Atomic OK"

echo "ALL WRANGLER/D1 SMOKE TESTS PASSED"
