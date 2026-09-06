#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INDEX_FILE="$ROOT_DIR/worker-airtrust/src/index.ts"

if [[ ! -f "$INDEX_FILE" ]]; then
  echo "❌ index.ts não encontrado: $INDEX_FILE"
  exit 1
fi

assets_line=$(grep -n "app.route('/api/assets', assetsRouter);" "$INDEX_FILE" | head -1 | cut -d: -f1 || true)
first_generic_api_line=$(grep -n "app.route('/api', " "$INDEX_FILE" | head -1 | cut -d: -f1 || true)

if [[ -z "$assets_line" ]]; then
  echo "❌ Guard falhou: rota /api/assets não encontrada em worker-airtrust/src/index.ts"
  exit 1
fi

if [[ -z "$first_generic_api_line" ]]; then
  echo "❌ Guard falhou: nenhuma rota genérica app.route('/api', ...) encontrada"
  exit 1
fi

if (( assets_line >= first_generic_api_line )); then
  echo "❌ Guard falhou: /api/assets está abaixo de app.route('/api', ...)."
  echo "   Isso pode causar interceptação de auth e quebrar logos."
  echo "   assets_line=$assets_line first_generic_api_line=$first_generic_api_line"
  exit 1
fi

# Rotas montadas em '/api' NÃO podem ter middleware global auth('*')
API_MOUNTED_ROUTES=(
  "$ROOT_DIR/worker-airtrust/src/routes/lookup.ts"
  "$ROOT_DIR/worker-airtrust/src/routes/ficha360.ts"
  "$ROOT_DIR/worker-airtrust/src/routes/compliance.ts"
  "$ROOT_DIR/worker-airtrust/src/routes/alertas.ts"
)

for route_file in "${API_MOUNTED_ROUTES[@]}"; do
  if [[ ! -f "$route_file" ]]; then
    echo "❌ Guard falhou: arquivo de rota não encontrado: $route_file"
    exit 1
  fi

  if grep -Eq "\.use\('\*',\s*auth\(" "$route_file"; then
    echo "❌ Guard falhou: middleware global auth('*') detectado em $(basename "$route_file")"
    echo "   Em rotas montadas em '/api', isso pode bloquear endpoints públicos como /api/assets/*"
    exit 1
  fi

done

if grep -Fq "pathname.startsWith('/api/certificados/validar')" "$INDEX_FILE"; then
  echo "❌ Guard falhou: validação pública de certificado usa prefixo sem boundary."
  exit 1
fi

grep -Fq "pathname === '/api/certificados/validar'" "$INDEX_FILE" || {
  echo "❌ Guard falhou: boundary exato de /api/certificados/validar ausente."
  exit 1
}

grep -Fq "pathname.startsWith('/api/certificados/validar/')" "$INDEX_FILE" || {
  echo "❌ Guard falhou: boundary com slash de /api/certificados/validar/* ausente."
  exit 1
}

echo "✅ Auth boundary guard OK"
