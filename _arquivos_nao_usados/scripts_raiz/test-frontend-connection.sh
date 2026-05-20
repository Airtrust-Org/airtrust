#!/bin/bash
set -euo pipefail

echo "🔍 TESTE DE CONEXÃO: Frontend ↔ Produção DB"
echo ""

# Test 1: Database connectivity
echo "✓ Teste 1: Banco de Dados (Produção D1)"
cd "worker-airtrust"
echo "  Query: SELECT COUNT(*) FROM funcionarios"
wrangler d1 execute DB --command "SELECT COUNT(*) as count FROM funcionarios;" --remote --env production 2>&1 | grep -A 3 '"count"' | head -5
echo ""

# Test 2: API endpoint
echo "✓ Teste 2: Verificar estrutura da tabela"
echo "  Query: PRAGMA table_info(funcionarios)"
COLS=$(wrangler d1 execute DB --command "PRAGMA table_info(funcionarios);" --remote --env production 2>&1 | grep '"name"' | wc -l)
echo "  Colunas encontradas: $COLS"
echo ""

# Test 3: Sample data
echo "✓ Teste 3: Dados de exemplo"
echo "  Query: SELECT nome, email, cargo FROM funcionarios LIMIT 1"
wrangler d1 execute DB --command "SELECT nome, email, cargo FROM funcionarios LIMIT 1;" --remote --env production 2>&1 | grep -A 10 '"nome"' | head -8
echo ""

# Test 4: Qualificações
echo "✓ Teste 4: Qualificações Histórico"
echo "  Query: SELECT COUNT(*) FROM qualificacoes_historico"
wrangler d1 execute DB --command "SELECT COUNT(*) as count FROM qualificacoes_historico;" --remote --env production 2>&1 | grep -A 3 '"count"' | head -5
echo ""

echo "✅ Dados em Produção D1:"
echo "   • Funcionarios: ✓ Disponível"
echo "   • Qualificações: ✓ Disponível"
echo ""
echo "🌐 Frontend deve conectar em:"
echo "   • VITE_API_URL=http://localhost:8787/api"
echo "   • Via .env.development"
echo ""
echo "💡 Para testar frontend:"
echo "   1. npm run dev (em outro terminal)"
echo "   2. npm run dev:prod (neste terminal)"
echo "   3. Abrir http://localhost:3000"
echo "   4. Ver dados em Funcionários e Qualificações"
