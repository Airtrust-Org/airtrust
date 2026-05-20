#!/bin/bash

# 🔐 Script para Criar Token via Cloudflare API
# Use seu Global API Token ou faça via Dashboard

# ==========================================
# OPÇÃO 1: Se você tiver Global API Token
# ==========================================

# Obtenha em: https://dash.cloudflare.com/profile/api-tokens
# (Procure por "Global API Token" - é a senha usada no terminal antigo)

# Se tiver, execute:
# export CF_GLOBAL_TOKEN="seu_global_token_aqui"
# export CF_EMAIL="filipe.daumas@icloud.com"

# Depois rode este script:

if [ -z "$CF_GLOBAL_TOKEN" ] || [ -z "$CF_EMAIL" ]; then
  echo "❌ Variáveis não definidas!"
  echo ""
  echo "Use:"
  echo "  export CF_GLOBAL_TOKEN='seu_token'"
  echo "  export CF_EMAIL='filipe.daumas@icloud.com'"
  exit 1
fi

ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"

echo "🔑 Criando novo API Token..."
echo ""

curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_GLOBAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "airtrust-workers-d1-2025",
    "status": "active",
    "description": "Token para deploy de Workers e acesso a D1",
    "policies": [
      {
        "id": "f2a0f7a4f0a9b8c9d8e7f6a5b4c3d2e1",
        "effect": "allow",
        "resources": {
          "com.cloudflare.api/*": "*"
        },
        "permission_groups": [
          {
            "id": "c1fde68e3f02b1cb8b73e98f01e50859"
          },
          {
            "id": "62d9e2f8c9b8a7f6e5d4c3b2a1f0e9d8"
          },
          {
            "id": "5fb17ce3c1a9d8e7f6a5b4c3d2e1f0a9"
          }
        ]
      }
    ],
    "expires_on": "2025-02-14T00:00:00Z"
  }' | jq .

echo ""
echo "✅ Se viu o token acima, copie e use!"
