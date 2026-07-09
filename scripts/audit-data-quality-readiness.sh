#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_VALIDATOR="$ROOT_DIR/scripts/validation/validate-data-quality-sql.sh"
SQL_FILE="$ROOT_DIR/scripts/validation/data-quality-checks-readonly.sql"
RUNNER_FILE="$ROOT_DIR/scripts/validation/run-data-quality-local.sh"
READINESS_DOC="$ROOT_DIR/docs/AIRTRUST_DATA_QUALITY_BACKFILL_READINESS_v0_5.md"
CONTRACT_DOC="$ROOT_DIR/docs/AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md"
RUNBOOK_DOC="$ROOT_DIR/docs/AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md"
GENERIC_GATE="$ROOT_DIR/scripts/controlled-execution-gate.sh"
DQ_GATE="$ROOT_DIR/scripts/dq01-controlled-backfill-gate.sh"
DQ_TEST="$ROOT_DIR/worker-airtrust/src/__tests__/routes/simuladores-sessoes-data-quality.test.ts"
SESSOES_ROUTE="$ROOT_DIR/worker-airtrust/src/routes/simuladores-sessoes.ts"
PARTICIPANTES_ROUTE="$ROOT_DIR/worker-airtrust/src/routes/simuladores-sessoes-participantes.ts"

fail() {
  echo "[data-quality-readiness] FAIL: $1" >&2
  exit 1
}

[[ -f "$SQL_VALIDATOR" ]] || fail "SQL validator not found"
[[ -f "$SQL_FILE" ]] || fail "read-only SQL file not found"
[[ -f "$RUNNER_FILE" ]] || fail "local DQ runner not found"
[[ -f "$READINESS_DOC" ]] || fail "DQ readiness doc not found"
[[ -f "$CONTRACT_DOC" ]] || fail "controlled execution contract doc not found"
[[ -f "$RUNBOOK_DOC" ]] || fail "controlled execution runbook doc not found"
[[ -f "$GENERIC_GATE" ]] || fail "generic controlled execution gate not found"
[[ -f "$DQ_GATE" ]] || fail "DQ controlled gate not found"
[[ -f "$DQ_TEST" ]] || fail "DQ route test not found"
[[ -f "$SESSOES_ROUTE" ]] || fail "simuladores-sessoes route not found"
[[ -f "$PARTICIPANTES_ROUTE" ]] || fail "simuladores-sessoes-participantes route not found"

bash "$SQL_VALIDATOR" "$SQL_FILE" >/dev/null

# The dynamic read-only checks (like empresa_sem_admin) were migrated to Node and are now asserted
# by the run-integrity.mjs runner. The static SQL regex scan for them was removed.

LC_ALL=C grep -Fq "production target forbidden" "$RUNNER_FILE" || fail "local DQ runner must remain fail-closed for production"
LC_ALL=C grep -Fq "AND empresa_id = ?" "$SESSOES_ROUTE" || fail "instrutores query lost tenant constraint"
LC_ALL=C grep -Fq "FROM simulador_agendamentos" "$PARTICIPANTES_ROUTE" || fail "session scoped lookup missing source table"
LC_ALL=C grep -Fq "WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL" "$PARTICIPANTES_ROUTE" || fail "session scoped lookup missing tenant guard"
LC_ALL=C grep -Fq "FROM funcionarios" "$PARTICIPANTES_ROUTE" || fail "funcionario scoped lookup missing source table"
LC_ALL=C grep -Fq "sa.empresa_id = ?" "$PARTICIPANTES_ROUTE" || fail "participant/session join missing tenant guard"
LC_ALL=C grep -Fq "qt.empresa_id = ?" "$PARTICIPANTES_ROUTE" || fail "checks fallback missing tenant guard"

check_count="migrated_to_node"
echo "[data-quality-readiness] PASS: readonly_checks=$check_count critical_routes_tenant_scoped=YES runner_fail_closed_for_production=YES controlled_execution_package=YES"
