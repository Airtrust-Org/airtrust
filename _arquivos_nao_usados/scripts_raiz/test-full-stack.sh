#!/bin/bash
set -euo pipefail

echo "📡 TESTE COMPLETO: Frontend ↔ API ↔ Produção D1"
echo ""
echo "Etapa 1: Verificar dados em D1"
echo "================================"
cd worker-airtrust
FUNC_COUNT=$(wrangler d1 execute DB --command "SELECT COUNT(*) as count FROM funcionarios;" --remote --env production 2>&1 | grep '"count"' | grep -oE '[0-9]+' | head -1)
echo "✓ Funcionarios em D1: $FUNC_COUNT registros"

QUAL_COUNT=$(wrangler d1 execute DB --command "SELECT COUNT(*) as count FROM qualificacoes_historico;" --remote --env production 2>&1 | grep '"count"' | grep -oE '[0-9]+' | head -1)
echo "✓ Qualificações em D1: $QUAL_COUNT registros"
echo ""

echo "Etapa 2: Testar API (mock)"
echo "============================"
echo "Simulando request: GET /api/funcionarios?limit=5"
wrangler d1 execute DB --command "SELECT id, nome, email, cargo, status FROM funcionarios LIMIT 5;" --remote --env production 2>&1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
results = data[0]['results'] if data and len(data) > 0 else []
print(f'✓ API retornaria {len(results)} funcionarios')
for i, r in enumerate(results[:3], 1):
    print(f'  [{i}] {r.get(\"nome\", \"?\")} - {r.get(\"cargo\", \"?\")}')
" 2>/dev/null || echo "  (parse error)"
echo ""

echo "Etapa 3: Configuração do Frontend"
echo "=================================="
if [ -f "../.env.development" ]; then
  API_URL=$(grep "VITE_API_URL" "../.env.development" | cut -d'=' -f2)
  echo "✓ .env.development configurado"
  echo "  VITE_API_URL=$API_URL"
else
  echo "❌ .env.development não encontrado"
fi
echo ""

echo "Etapa 4: Verificar conexão Frontend"
echo "===================================="
echo ""
echo "📝 INSTRUÇÕES PARA TESTAR:"
echo ""
echo "Terminal 1 - Inicie o Frontend:"
echo "  $ npm run dev"
echo ""
echo "Terminal 2 - Inicie a API (production):"
echo "  $ npm run dev:prod"
echo ""
echo "Terminal 3 - Acesse o app:"
echo "  Abra: http://localhost:3000"
echo "  Vá para: Funcionários (no menu)"
echo ""
echo "✅ RESULTADOS ESPERADOS:"
echo "  ✓ Carregamento inicial rápido"
echo "  ✓ Lista de $FUNC_COUNT funcionarios exibida"
echo "  ✓ Nomes, cargos, emails visíveis"
echo "  ✓ Sem erros no console (F12)"
echo "  ✓ Network tab: GET /api/funcionarios retorna 200"
echo ""
echo "📊 SE NÃO APARECER:"
echo "  1. Abrir DevTools (F12)"
echo "  2. Ir em Console e buscar erros"
echo "  3. Ir em Network e verificar requisição /api/funcionarios"
echo "  4. Verificar se API está em http://localhost:8787"
echo "  5. Executar: curl http://localhost:8787/health"
