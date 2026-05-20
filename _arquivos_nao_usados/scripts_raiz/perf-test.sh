#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ⏱️  TESTE DE PERFORMANCE - Medindo velocidade de endpoints ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"

# Teste 1: Funcionários
echo "🔍 TEST 1: GET /funcionarios"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/funcionarios" > /tmp/funcionarios.json 2>&1
echo ""

# Teste 2: Agendamentos
echo "🔍 TEST 2: GET /agendamentos"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/agendamentos" > /tmp/agendamentos.json 2>&1
echo ""

# Teste 3: Fichas
echo "🔍 TEST 3: GET /fichas"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/fichas" > /tmp/fichas.json 2>&1
echo ""

# Teste 4: Simuladores
echo "🔍 TEST 4: GET /simuladores"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/simuladores" > /tmp/simuladores.json 2>&1
echo ""

# Teste 5: Manobras
echo "🔍 TEST 5: GET /manobras"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/manobras" > /tmp/manobras.json 2>&1
echo ""

# Teste 6: Health Check
echo "🔍 TEST 6: GET /health"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/health" > /tmp/health.json 2>&1
echo ""

# Teste 7: Templates
echo "🔍 TEST 7: GET /simuladores-consolidado/templates"
echo "─────────────────────────────────────────────────────"
time curl -s -w "\nHTTP Status: %{http_code}\n" "$BASE_URL/simuladores-consolidado/templates" > /tmp/templates.json 2>&1
echo ""

# Verificar tamanho de responses
echo "📊 TAMANHO DAS RESPONSES:"
echo "─────────────────────────────────────────────────────"
echo "Funcionários: $(wc -c < /tmp/funcionarios.json) bytes"
echo "Agendamentos: $(wc -c < /tmp/agendamentos.json) bytes"
echo "Fichas: $(wc -c < /tmp/fichas.json) bytes"
echo "Simuladores: $(wc -c < /tmp/simuladores.json) bytes"
echo "Manobras: $(wc -c < /tmp/manobras.json) bytes"
echo "Health: $(wc -c < /tmp/health.json) bytes"
echo "Templates: $(wc -c < /tmp/templates.json) bytes"

