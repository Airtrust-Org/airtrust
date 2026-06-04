#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/worker-airtrust/migrations"
BOOTSTRAP_SQL="$ROOT_DIR/scripts/bootstrap-new-environment.sql"
READINESS_DOC="$ROOT_DIR/docs/AIRTRUST_MIGRATION_REBASELINE_READINESS_v0_5.md"
CONTRACT_DOC="$ROOT_DIR/docs/AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md"
RUNBOOK_DOC="$ROOT_DIR/docs/AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md"
GENERIC_GATE="$ROOT_DIR/scripts/controlled-execution-gate.sh"
MIG_GATE="$ROOT_DIR/scripts/mig01-controlled-rebaseline-gate.sh"
GOVERNANCE_TEST="$ROOT_DIR/worker-airtrust/src/__tests__/migrations/migration-governance.test.ts"
SIGVOOS_TEST="$ROOT_DIR/worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts"

fail() {
  echo "[migration-readiness] FAIL: $1" >&2
  exit 1
}

[[ -d "$MIGRATIONS_DIR" ]] || fail "canonical migrations directory not found"
[[ -f "$BOOTSTRAP_SQL" ]] || fail "bootstrap SQL not found"
[[ -f "$READINESS_DOC" ]] || fail "migration readiness doc not found"
[[ -f "$CONTRACT_DOC" ]] || fail "controlled execution contract doc not found"
[[ -f "$RUNBOOK_DOC" ]] || fail "controlled execution runbook doc not found"
[[ -f "$GENERIC_GATE" ]] || fail "generic controlled execution gate not found"
[[ -f "$MIG_GATE" ]] || fail "MIG controlled gate not found"
[[ -f "$GOVERNANCE_TEST" ]] || fail "migration governance test not found"
[[ -f "$SIGVOOS_TEST" ]] || fail "SIGVOOS replay test not found"

if LC_ALL=C grep -Eiq '(^|[^A-Z_])(INSERT|UPDATE|DELETE|UPSERT|REPLACE|DROP)([^A-Z_]|$)' "$BOOTSTRAP_SQL"; then
  fail "bootstrap SQL must remain DDL-only"
fi

if LC_ALL=C grep -Eiq '(wrangler|--remote|d1[[:space:]]+execute)' "$BOOTSTRAP_SQL"; then
  fail "bootstrap SQL must not reference remote execution"
fi

python3 - "$MIGRATIONS_DIR" <<'PY'
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

migrations_dir = Path(sys.argv[1])
files = sorted(path.name for path in migrations_dir.glob("*.sql"))
if not files:
    raise SystemExit("[migration-readiness] FAIL: no canonical migration files found")

prefix_map: dict[str, list[str]] = defaultdict(list)
for file_name in files:
    match = re.match(r"^([0-9]{4})_", file_name)
    if match:
        prefix_map[match.group(1)].append(file_name)

duplicate_groups = {prefix: names for prefix, names in prefix_map.items() if len(names) > 1}
non_standard = [file_name for file_name in files if not re.match(r"^[0-9]{4}_[a-z0-9_]+\.sql$", file_name)]
numeric_prefixes = sorted(int(prefix) for prefix in prefix_map if prefix != "9999")
sentinels = [file_name for file_name in files if file_name.startswith("9999_")]

if "9999_add_modelo_sessao_id_to_agendamentos.sql" not in sentinels:
    raise SystemExit("[migration-readiness] FAIL: reserved 9999 sentinel missing")

regular_max = numeric_prefixes[-1] if numeric_prefixes else None
print(
    "[migration-readiness] PASS:",
    f"canonical_sql_files={len(files)}",
    f"duplicate_prefix_groups={len(duplicate_groups)}",
    f"non_standard_files={len(non_standard)}",
    f"regular_max_prefix={regular_max}",
    f"sentinel_count={len(sentinels)}",
    "controlled_execution_package=YES",
)
PY
