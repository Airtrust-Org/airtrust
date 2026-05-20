#!/usr/bin/env bash
# =============================================================================
# seed-functional-demo.sh
# Idempotent seed of minimal fictional data for staging QA
#
# SAFETY GUARDS:
#   - Refuses to run against production DB
#   - Uses INSERT OR IGNORE for full idempotency
#   - No passwords, tokens, or real data
#   - Targets only airtrust-db-staging --env staging
# =============================================================================

set -euo pipefail

# ── Safety guard ──────────────────────────────────────────────────────────────
DB_NAME="airtrust-db-staging"
ENV_FLAG="staging"

echo "[seed] Target DB : $DB_NAME (env=$ENV_FLAG)"
echo "[seed] Verifying this is NOT production..."

# Block if accidentally pointed at production DB ID
PROD_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
STAGING_DB_ID="b7f50907-c110-45f5-ad17-e97ea47f2826"

# Check current DB IDs via wrangler (read-only list)
if npx wrangler d1 list 2>/dev/null | grep -q "$PROD_DB_ID"; then
  # Production DB exists in account - verify we're not executing against it
  if [ "$DB_NAME" = "airtrust-db" ]; then
    echo "[ERROR] BLOCKED: DB name is 'airtrust-db' — this is the production database."
    exit 1
  fi
fi

echo "[seed] Safety check passed. Proceeding with staging seed..."
echo ""

WORKER_DIR="$(cd "$(dirname "$0")/../../worker-airtrust" && pwd)"
cd "$WORKER_DIR"

run_sql() {
  local description="$1"
  local sql="$2"
  echo "[seed] $description"
  npx wrangler d1 execute "$DB_NAME" --env "$ENV_FLAG" --remote --command "$sql" 2>&1 | tail -5
}

# ── 1. Empresa demo ──────────────────────────────────────────────────────────
run_sql "Insert empresa demo (idempotent)" \
  "INSERT OR IGNORE INTO empresas (id, nome, cnpj) VALUES (9001, 'AeroDemo Fictícia Ltda', '00000000000100');"

# ── 2. Funcionário demo ──────────────────────────────────────────────────────
run_sql "Insert funcionário demo (idempotent)" \
  "INSERT OR IGNORE INTO funcionarios (id, nome, cargo, ativo) VALUES (9001, 'Joao Demo Silva', 'Piloto Comandante Demo', 1);"

# ── 3. Qualificação tipo demo ─────────────────────────────────────────────────
run_sql "Insert qualificacao_tipo demo (idempotent)" \
  "INSERT OR IGNORE INTO qualificacoes_tipos (id, nome, descricao, validade, ativo) VALUES (9001, 'Habilitacao Demo HA-9001', 'Qualificacao ficticia para testes de QA', 365, 1);"

# ── 4. LMS curso demo ────────────────────────────────────────────────────────
run_sql "Insert lms_curso demo (idempotent)" \
  "INSERT OR IGNORE INTO lms_cursos (id, titulo, descricao, ativo) VALUES (9001, 'Curso Demo Seguranca de Voo QA', 'Curso ficticio para validacao do modulo LMS', 1);"

# ── 5. Simulador demo ────────────────────────────────────────────────────────
run_sql "Insert simulador demo (idempotent)" \
  "INSERT OR IGNORE INTO simuladores (id, nome, modelo, status) VALUES (9001, 'Simulador Demo FTD-9001', 'AW139', 'ativo');"

echo ""
echo "[seed] Done. Seed complete (all inserts were idempotent via INSERT OR IGNORE)."
echo "[seed] DB: $DB_NAME | Env: $ENV_FLAG"
