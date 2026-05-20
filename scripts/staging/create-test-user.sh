#!/usr/bin/env bash
# Seed test user in AirTrust staging D1.
# Only runs against airtrust-db-staging. Never touches production.
#
# Usage:
#   STAGING_TEST_PASSWORD='your-password-here' bash scripts/staging/create-test-user.sh
#
# The password is NEVER logged, committed, or saved to disk outside of env vars.

set -euo pipefail

TARGET_DB="${1:-airtrust-db-staging}"

if [ "$TARGET_DB" != "airtrust-db-staging" ]; then
  echo "ERROR: This script only runs against airtrust-db-staging. Got: $TARGET_DB" >&2
  exit 1
fi

if [ -z "${STAGING_TEST_PASSWORD:-}" ]; then
  echo "ERROR: STAGING_TEST_PASSWORD env var is required." >&2
  echo "Usage: STAGING_TEST_PASSWORD='your-password' bash scripts/staging/create-test-user.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Generate bcrypt hash using the same algorithm as production (bcryptjs, 10 rounds)
# Uses process.stdout.write to avoid capturing stderr junk in the hash
HASH=$(node -e "
const bcrypt = require('$PROJECT_ROOT/worker-airtrust/node_modules/bcryptjs');
const salt = bcrypt.genSaltSync(10);
process.stdout.write(bcrypt.hashSync(process.argv[1], salt));
" "$STAGING_TEST_PASSWORD" 2>/dev/null)

if [ -z "$HASH" ]; then
  echo "ERROR: Failed to generate password hash." >&2
  exit 1
fi

echo "[seed] Generating seed SQL..."
echo "[seed] Target: $TARGET_DB (staging remote)"
echo "[seed] Password hash generated successfully (not logged)."

# Create temp SQL file with idempotent inserts
SQL_FILE=$(mktemp /tmp/airtrust-staging-seed.XXXXXX.sql)
trap "rm -f $SQL_FILE" EXIT

cat > "$SQL_FILE" << SQLEOF
-- AirTrust Staging Seed: test empresa + admin user
-- Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
-- Target: airtrust-db-staging (staging only)
-- ALL DATA IS FICTITIOUS - no real customer/employee data

-- 1. Insert test company (idempotent)
INSERT OR IGNORE INTO empresas (nome, codigo, cnpj, ativo, plano, max_funcionarios, max_storage_mb, created_at, updated_at)
VALUES ('AirTrust Staging Test Company', 'staging-test', '00000000000191', 1, 'basic', 100, 1000, datetime('now'), datetime('now'));

-- 2. Insert test admin user (idempotent by email)
INSERT OR IGNORE INTO usuarios (email, password_hash, nome, perfil, active, created_at, updated_at)
VALUES ('admin.staging.test@example.invalid', '${HASH}', 'Admin Staging Test', 'ADMIN', 1, datetime('now'), datetime('now'));

-- 2b. Always update password hash (supports password rotation for existing user)
UPDATE usuarios
SET password_hash = '${HASH}', updated_at = datetime('now')
WHERE email = 'admin.staging.test@example.invalid';

-- 3. Link user to empresa via usuarios_empresas (idempotent)
INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary, created_at)
SELECT u.id, e.id, 'admin', 1, datetime('now')
FROM usuarios u
CROSS JOIN empresas e
WHERE u.email = 'admin.staging.test@example.invalid'
  AND e.codigo = 'staging-test'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas ue
    WHERE ue.usuario_id = u.id AND ue.empresa_id = e.id
  );

-- 4. Insert test employee linked to empresa (idempotent by email)
INSERT OR IGNORE INTO funcionarios (nome, email, matricula, cpf, cargo, status, ativo, empresa_id, created_at, updated_at)
SELECT 'Funcionario Teste Staging', 'funcionario.staging.test@example.invalid', 'STG-001', '00000000000', 'Piloto', 'ATIVO', 1, e.id, datetime('now'), datetime('now')
FROM empresas e
WHERE e.codigo = 'staging-test'
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.email = 'funcionario.staging.test@example.invalid'
  );

-- 5. Link admin user to funcionario (update if funcionario exists)
UPDATE usuarios
SET funcionario_id = (
  SELECT f.id FROM funcionarios f
  INNER JOIN empresas e ON e.id = f.empresa_id
  WHERE f.email = 'funcionario.staging.test@example.invalid'
    AND e.codigo = 'staging-test'
  LIMIT 1
)
WHERE email = 'admin.staging.test@example.invalid'
  AND funcionario_id IS NULL;
SQLEOF

echo "[seed] SQL file prepared. Executing against staging..."
echo ""

npx wrangler d1 execute "$TARGET_DB" --env staging --file "$SQL_FILE" --remote 2>&1

echo ""
echo "[seed] Done. Verifying..."

# Verify without exposing hash
npx wrangler d1 execute "$TARGET_DB" --env staging \
  --command "SELECT id, email, nome, perfil, active FROM usuarios WHERE email = 'admin.staging.test@example.invalid';" \
  --remote 2>&1

echo ""
echo "[seed] Seed complete."
echo "  Empresa: AirTrust Staging Test Company (codigo: staging-test)"
echo "  Usuario: admin.staging.test@example.invalid"
echo "  Perfil: ADMIN"
echo "  Password: (never logged - stored in STAGING_TEST_PASSWORD)"
