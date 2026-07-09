#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROUTES_DIR="$ROOT_DIR/worker-airtrust/src/routes"

echo "🔎 Verificando endpoints de mutação sem proteção de tenant..."

# Allowlist de arquivos que são seguros ou globais/platform-admin
# Ex: auth, arquivos puramente publicos, migrations manuais, etc.
ALLOWLIST=(
  "auth.ts"
  "admin-manual-migrations.ts"
  "migrations.ts"
  "public.ts" "public-routes.ts"
  "frms-relatorios-config.ts"
  "backup.ts"
  "notificacoes.ts" # already uses getEmpresaId or requirePlatformAdmin explicitly on writes
  "webhooks.ts"
)

# Encontra arquivos .ts em routes/
FILES=$(find "$ROUTES_DIR" -type f -name "*.ts")

VIOLATIONS=0

for file in $FILES; do
  filename=$(basename "$file")
  
  # Ignora arquivos na allowlist
  skip=0
  for allowed in "${ALLOWLIST[@]}"; do
    if [[ "$filename" == "$allowed" ]]; then
      skip=1
      break
    fi
  done
  if [[ $skip -eq 1 ]]; then
    continue
  fi

  # Verifica se tem app.post, put, patch ou delete
  if grep -Eq "\.(post|put|patch|delete)\(" "$file"; then
    # Se tiver rota de mutação, deve usar 'getEmpresaId', 'empresa_id', 'getTenantContext' ou 'requirePlatformAdmin'
    # Esta é uma validação simples para CI
    if ! grep -Eq "(getEmpresaId|empresa_id|empresaId|getTenantContext|requirePlatformAdmin|isPlatformAdmin|assertTripulanteEmpresa)" "$file"; then
      echo "❌ Risco de vazamento em $filename: Endpoint de mutação detectado sem helper de tenant-scope ou clausula empresa_id."
      VIOLATIONS=$((VIOLATIONS+1))
    fi
  fi
done

if [[ $VIOLATIONS -gt 0 ]]; then
  echo "❌ Guard falhou: $VIOLATIONS violações de tenant-scope encontradas em rotas de mutação."
  exit 1
else
  echo "✅ Tenant mutations guard OK"
fi
