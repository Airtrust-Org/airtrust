#!/bin/bash

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🧪 TESTE DE CRIAR AGENDAMENTO                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Teste 1: GET lista de agendamentos (deve estar vazia ou com dados)
echo "1️⃣  Listando agendamentos atuais:"
curl -s "$BASE_URL/api/v2/agendamentos" | jq '.data | length' || echo "erro"
echo ""

# Teste 2: Criar agendamento com campos corretos
echo "2️⃣  Criando agendamento (com campo 'data'):"
curl -s -X POST "$BASE_URL/api/v2/agendamentos" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 6,
    "simulador_id": 11,
    "data": "2025-11-10",
    "hora_inicio": "09:00",
    "hora_fim": "10:30",
    "tipo_sessao": "PRATICA",
    "instrutor_id": 9
  }' | jq '.' | head -20
echo ""

# Teste 3: Tentar com campo 'data_agendamento' (alternativa)
echo "3️⃣  Criando agendamento (com campo 'data_agendamento'):"
curl -s -X POST "$BASE_URL/api/v2/agendamentos" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_id": 6,
    "simulador_id": 11,
    "data_agendamento": "2025-11-11",
    "hora_inicio": "11:00",
    "hora_fim": "12:30",
    "tipo_sessao": "PRATICA",
    "instrutor_id": 9
  }' | jq '.' | head -20
echo ""

echo "✅ Teste completo!"
