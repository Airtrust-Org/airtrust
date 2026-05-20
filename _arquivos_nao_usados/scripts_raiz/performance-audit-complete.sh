#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🔍 AUDITORIA DE PERFORMANCE - Procurando N+1 queries     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Procurar por COUNT() seguido de SELECT (padrão N+1)
echo "❌ ANTI-PADRÃO 1: COUNT() + SELECT (2 queries em vez de 1)"
echo "─────────────────────────────────────────────────────────"
grep -rn "SELECT COUNT" src/worker/api/v2/ 2>/dev/null | grep -v "// " | head -10
echo ""

# Procurar por loops com queries
echo "❌ ANTI-PADRÃO 2: Loops com queries (N+1 problem)"
echo "─────────────────────────────────────────────────────"
grep -B2 "for.*of\|for.*in" src/worker/api/v2/simulador-fichas-crud.ts | head -15
echo ""

# Procurar por SELECT sem JOINs que poderiam usar
echo "❌ ANTI-PADRÃO 3: SELECT simples que deveria fazer JOIN"
echo "─────────────────────────────────────────────────────"
grep -n "SELECT.*FROM funcionarios\|SELECT.*FROM simuladores" src/worker/api/v2/simulador-fichas-crud.ts | head -10
echo ""

# Procurar por múltiplas queries seguidas
echo "❌ ANTI-PADRÃO 4: Múltiplas queries separadas"
echo "─────────────────────────────────────────────────────"
grep -n "db.prepare\|db.query" src/worker/api/v2/simulador-fichas-crud.ts | wc -l
echo "Total de db.prepare() calls no arquivo fichas"

