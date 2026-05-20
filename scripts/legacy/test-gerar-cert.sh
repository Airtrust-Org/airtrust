#!/bin/bash

# Buscar token de um admin do banco
ADMIN_ID="1"
ADMIN_EMAIL="admin@airtrust.com.br"

# Token de teste (você pode usar de verdade se tiver)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBhaXJ0cnVzdC5jb20uYnIiLCJyb2xlIjoiYWRtaW4ifQ.test"

echo "🔍 Testando geração de certificado para ID 3577..."
echo ""

# Fazer a chamada e mostrar resposta formatada
curl -s -X POST "https://airtrust-api-production.airtrust.workers.dev/api/certificados/historico/3577/certificados/gerar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq . 2>/dev/null || \
curl -s -X POST "https://airtrust-api-production.airtrust.workers.dev/api/certificados/historico/3577/certificados/gerar" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

echo ""
echo "✅ Teste concluído"
