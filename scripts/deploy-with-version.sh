#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# AirTrust - Deploy com Capture de Version ID
# ===================================================================
# Este script executa o deploy automaticamente e passa o Version ID
# capturado como variável de ambiente para os deploys subsequentes.
# ===================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

# Tenta carregar env existente
if [ -f .env.production ]; then
  set -a
  source .env.production
  set +a
fi

# Executa o deploy
echo "🚀 Executando deploy com captura de versão..."
./deploy-full-automated.sh

# Lê a versão salva
if [ -f .deployment_version ]; then
  VERSION_ID=$(cat .deployment_version | tr -d ' \n')
  echo ""
  echo "📌 Versão capturada: $VERSION_ID"
  
  # Salva no .env para próximos deploys poderem acessar
  if [ -f .env.production ]; then
    # Atualiza a linha CF_DEPLOYMENT_ID se existir, senão adiciona
    if grep -q "CF_DEPLOYMENT_ID" .env.production; then
      sed -i '' "s/^CF_DEPLOYMENT_ID=.*/CF_DEPLOYMENT_ID=$VERSION_ID/" .env.production
    else
      echo "CF_DEPLOYMENT_ID=$VERSION_ID" >> .env.production
    fi
    echo "✅ Version ID salvo em .env.production"
  fi
fi

echo "🎉 Deploy concluído!"
