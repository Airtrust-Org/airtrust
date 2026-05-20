#!/bin/bash
# Script para gerar/recuperar token de teste
cd "/Users/filipedaumas/Documents/airtrust v1"

# Tentar fazer login com credenciais de teste
TOKEN=$(curl -s -X POST http://localhost:8787/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@airtrust.local",
    "password": "admin123"
  }' | jq -r '.data.token // empty')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  echo "$TOKEN"
  exit 0
fi

# Se login falhou, tentar com seed de teste
curl -s -X POST http://localhost:8787/api/auth/seed-test-user 2>/dev/null | jq -r '.data.token // empty' || echo ""
