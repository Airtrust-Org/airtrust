#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# AirTrust - Update Version Info
# ===================================================================
# Após o deploy, este script atualiza o arquivo de versão que será
# servido pelo frontend.
# ===================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.. " && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f .deployment_version ]; then
  echo "⚠️ Arquivo .deployment_version não encontrado"
  exit 1
fi

VERSION_ID=$(cat .deployment_version | tr -d ' \n')

# Cria arquivo JSON com a versão
mkdir -p dist/client
cat > dist/client/.version.json << EOF
{
  "version": "$VERSION_ID",
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')",
  "environment": "production"
}
EOF

echo "✅ Versão $VERSION_ID escrita em dist/client/.version.json"
