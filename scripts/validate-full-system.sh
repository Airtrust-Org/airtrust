#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[validate-full-system] Iniciando validação completa..."

if [ -f "scripts/validate_complete.sh" ]; then
  chmod +x scripts/validate_complete.sh
  ./scripts/validate_complete.sh
else
  echo "[validate-full-system] scripts/validate_complete.sh não encontrado"
  exit 1
fi

if [ -f "scripts/smoke-tests.sh" ]; then
  chmod +x scripts/smoke-tests.sh
  if ! ./scripts/smoke-tests.sh; then
    echo "[validate-full-system] Smoke tests falharam (verificar endpoint alvo/configuração)."
  fi
fi

echo "[validate-full-system] Concluído."
