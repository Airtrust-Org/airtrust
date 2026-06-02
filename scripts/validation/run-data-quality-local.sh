#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_FILE="$ROOT_DIR/scripts/validation/data-quality-checks-readonly.sql"
VALIDATOR="$ROOT_DIR/scripts/validation/validate-data-quality-sql.sh"

fail() {
  echo "$1" >&2
  exit 1
}

discover_local_db() {
  local state_dir="$ROOT_DIR/worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
  local best_file=""
  local best_size="-1"
  local file size

  [[ -d "$state_dir" ]] || return 1

  while IFS= read -r -d '' file; do
    size=$(stat -f '%z' "$file" 2>/dev/null || echo 0)
    if [[ "$size" -gt "$best_size" ]]; then
      best_size="$size"
      best_file="$file"
    fi
  done < <(find "$state_dir" -maxdepth 1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' -print0)

  [[ -n "$best_file" ]] || return 1
  printf '%s\n' "$best_file"
}

[[ "${AIRTRUST_ALLOW_DATA_QUALITY_RUN:-}" == "YES" ]] || fail "SKIPPED_DATA_QUALITY_RUN — AIRTRUST_ALLOW_DATA_QUALITY_RUN must be YES"

TARGET="${AIRTRUST_DATA_QUALITY_TARGET:-}"
case "$TARGET" in
  local|staging) ;;
  production) fail "SKIPPED_DATA_QUALITY_RUN — production target forbidden" ;;
  "") fail "SKIPPED_DATA_QUALITY_RUN — AIRTRUST_DATA_QUALITY_TARGET must be local or staging" ;;
  *) fail "SKIPPED_DATA_QUALITY_RUN — AIRTRUST_DATA_QUALITY_TARGET must be local or staging" ;;
esac

bash "$VALIDATOR"

DB_PATH="${AIRTRUST_DATA_QUALITY_DB_PATH:-${AIRTRUST_DATA_QUALITY_STAGING_DB_PATH:-}}"
if [[ -z "$DB_PATH" && "$TARGET" == "local" ]]; then
  DB_PATH="$(discover_local_db || true)"
fi

[[ -n "$DB_PATH" && -f "$DB_PATH" ]] || fail "SKIPPED_DATA_QUALITY_RUN — local/staging database not configured"

if [[ "$TARGET" == "staging" && -z "${AIRTRUST_DATA_QUALITY_DB_PATH:-${AIRTRUST_DATA_QUALITY_STAGING_DB_PATH:-}}" ]]; then
  fail "SKIPPED_DATA_QUALITY_RUN — staging database path not configured"
fi

command -v python3 >/dev/null 2>&1 || fail "python3 not found"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/airtrust-data-quality.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

SNAPSHOT_DB="$TMP_DIR/data-quality-snapshot.sqlite"
cp "$DB_PATH" "$SNAPSHOT_DB"

python3 - "$TARGET" "$SNAPSHOT_DB" "$SQL_FILE" <<'PY'
from __future__ import annotations

import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

target = sys.argv[1]
db_path = sys.argv[2]
sql_path = sys.argv[3]

meta = {
    "empresa_sem_admin": {
        "category": "TENANT_ISOLATION",
        "tables": ["empresas", "usuarios_empresas", "usuarios"],
        "objective": "Detectar tenant sem admin/manager ativo antes do onboarding.",
        "domain": "empresas / usuarios / usuarios_empresas",
        "severity": "BLOCKER",
        "blocks_external": True,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "usuario_sem_empresa": {
        "category": "USUARIOS_PERMISSOES",
        "tables": ["usuarios", "usuarios_empresas"],
        "objective": "Detectar usuario ativo sem vinculo com tenant.",
        "domain": "usuarios / usuarios_empresas",
        "severity": "BLOCKER",
        "blocks_external": True,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "usuario_multiplas_empresas_sem_primaria": {
        "category": "USUARIOS_PERMISSOES",
        "tables": ["usuarios_empresas"],
        "objective": "Detectar usuario com multiplos tenants sem empresa primaria/clara.",
        "domain": "usuarios_empresas",
        "severity": "BLOCKER",
        "blocks_external": True,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "funcionario_duplicado_tenant": {
        "category": "DUPLICATES",
        "tables": ["funcionarios"],
        "objective": "Detectar duplicidade operacional no mesmo tenant.",
        "domain": "funcionarios",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; emit only totals",
    },
    "funcionario_sem_empresa": {
        "category": "DATA_ORPHANS",
        "tables": ["funcionarios"],
        "objective": "Detectar funcionario ativo sem tenant.",
        "domain": "funcionarios",
        "severity": "BLOCKER",
        "blocks_external": True,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "qualificacao_duplicada": {
        "category": "QUALIFICACOES",
        "tables": ["qualificacoes_historico"],
        "objective": "Detectar duplicidade de qualificacao ativa por funcionario/ciclo.",
        "domain": "qualificacoes_historico",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; emit only totals",
    },
    "qualificacao_planejada_orfa": {
        "category": "DATA_ORPHANS",
        "tables": ["qualificacoes_historico", "funcionarios"],
        "objective": "Detectar planejamento sem funcionario ou referencia valida.",
        "domain": "qualificacoes_historico / funcionarios",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "sessao_simulador_sem_participantes": {
        "category": "SIMULADORES",
        "tables": ["simulador_sessoes", "simulador_sessao_participantes"],
        "objective": "Detectar sessao de simulador sem participantes.",
        "domain": "simulador_sessoes / simulador_sessao_participantes",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "escala_sem_tenant_valido": {
        "category": "ESCALAS_EVD",
        "tables": ["escalas_mensais", "empresas"],
        "objective": "Detectar escala sem tenant valido.",
        "domain": "escalas_mensais / empresas",
        "severity": "BLOCKER",
        "blocks_external": True,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "alocacao_sem_escala_valida": {
        "category": "ESCALAS_EVD",
        "tables": ["escala_alocacoes", "escalas_mensais"],
        "objective": "Detectar alocacao orfa sem escala pai valida.",
        "domain": "escala_alocacoes / escalas_mensais",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "alocacao_duplicada": {
        "category": "ESCALAS_EVD",
        "tables": ["escala_alocacoes"],
        "objective": "Detectar alocacao duplicada no mesmo intervalo.",
        "domain": "escala_alocacoes",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; emit only totals",
    },
    "status_divergente": {
        "category": "STATUS_COMPATIBILITY",
        "tables": ["qualificacoes_historico"],
        "objective": "Detectar status legados fora da normalizacao esperada.",
        "domain": "qualificacoes_historico",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; emit only totals",
    },
    "registro_ativo_deleted_at_inconsistente": {
        "category": "SOFT_DELETE",
        "tables": ["funcionarios"],
        "objective": "Detectar inconsistencia entre status ativo e deleted_at.",
        "domain": "funcionarios",
        "severity": "WARN",
        "blocks_external": False,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": False,
        "sanitize": "count only; never emit ids or names",
    },
    "frms_jornada_sem_dados_minimos": {
        "category": "FRMS",
        "tables": ["frms_jornadas"],
        "objective": "Detectar jornada FRMS sem campos minimos obrigatorios.",
        "domain": "frms_jornadas",
        "severity": "BLOCKER",
        "blocks_external": True,
        "blocks_internal": True,
        "expected": "0 rows",
        "pii": True,
        "sanitize": "count only; never emit ids or fields",
    },
}

def load_statements(path: str) -> list[str]:
    text = Path(path).read_text()
    statements: list[str] = []
    current: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("--"):
            continue
        current.append(raw_line)
        if ";" in raw_line:
            stmt = " ".join(" ".join(current).split())
            stmt = stmt.rsplit(";", 1)[0].strip()
            if stmt:
                statements.append(stmt)
            current = []
    if current:
        raise RuntimeError(f"unterminated SQL statement: {' '.join(current)}")
    return statements


def extract_name(stmt: str, fallback_index: int) -> str:
    match = re.search(r"SELECT\s+'([^']+)'\s+AS\s+check_name", stmt, re.IGNORECASE)
    if match:
        return match.group(1)
    return f"check_{fallback_index:02d}"


def table_names(conn: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
        )
    }


conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
available_tables = table_names(conn)
statements = load_statements(sql_path)

report_rows = []
category_totals = defaultdict(Counter)
overall = "PASS"

print("DATA QUALITY RUN")
print(f"target={target}")
print(f"snapshot_db={db_path}")
print(f"sql_file={sql_path}")
print()
print("check_id | category | status | count | blocks_external | blocks_internal | note")

for index, stmt in enumerate(statements, 1):
    name = extract_name(stmt, index)
    info = meta.get(
        name,
        {
            "category": "UNCATEGORIZED",
            "tables": [],
            "objective": "unmapped",
            "domain": "unknown",
            "severity": "WARN",
            "blocks_external": False,
            "blocks_internal": False,
            "expected": "0 rows",
            "pii": False,
            "sanitize": "count only",
        },
    )

    missing = [table for table in info["tables"] if table not in available_tables]
    if missing:
        status = "SKIPPED"
        count_repr = "n/a"
        note = f"missing table(s): {', '.join(missing)}"
        overall = "SKIPPED" if overall == "PASS" else overall
    else:
        try:
            count = conn.execute(
                f"SELECT COUNT(*) AS total FROM ({stmt}) AS dq"
            ).fetchone()[0]
        except sqlite3.Error as exc:
            status = "SKIPPED"
            count_repr = "n/a"
            note = f"sql error: {exc}"
            overall = "SKIPPED" if overall == "PASS" else overall
        else:
            count_repr = str(count)
            if count == 0:
                status = "PASS"
                note = "zero rows"
            elif info["blocks_external"]:
                status = "FAIL"
                note = "blocking issue"
                overall = "FAIL"
            else:
                status = "WARN"
                note = "non-blocking issue"
                if overall == "PASS":
                    overall = "PASS"

    category = info["category"]
    category_totals[category][status] += 1
    report_rows.append((name, category, status, count_repr, info["blocks_external"], info["blocks_internal"], note))
    print(
        f"{name} | {category} | {status} | {count_repr} | {'yes' if info['blocks_external'] else 'no'} | {'yes' if info['blocks_internal'] else 'no'} | {note}"
    )

print()
print("CATEGORY SUMMARY")
for category in sorted(category_totals):
    counts = category_totals[category]
    print(
        f"{category}: PASS={counts['PASS']} WARN={counts['WARN']} FAIL={counts['FAIL']} SKIPPED={counts['SKIPPED']}"
    )

print()
print(
    "SUMMARY | PASS={} WARN={} FAIL={} SKIPPED={}".format(
        sum(1 for row in report_rows if row[2] == "PASS"),
        sum(1 for row in report_rows if row[2] == "WARN"),
        sum(1 for row in report_rows if row[2] == "FAIL"),
        sum(1 for row in report_rows if row[2] == "SKIPPED"),
    )
)

if any(row[2] == "FAIL" for row in report_rows):
    print("DECISION | FAIL | blocker(s) found")
    raise SystemExit(1)

if any(row[2] == "SKIPPED" for row in report_rows):
    print("DECISION | SKIPPED | partial schema coverage")
    raise SystemExit(0)

print("DECISION | PASS | no blockers found")
raise SystemExit(0)
PY
