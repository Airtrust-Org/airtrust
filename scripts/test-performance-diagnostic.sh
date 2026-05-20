#!/bin/bash
# test-performance-diagnostic.sh
# Diagnóstico completo de performance pós-refatoração

set -e

echo "🔍 DIAGNÓSTICO DE PERFORMANCE - AIRTRUST"
echo "========================================"
echo ""
echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

API_BASE="${API_BASE:-https://airtrust-api-production.airtrust.workers.dev/api}"

# Obter token
echo "🔐 Obtendo token de autenticação..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","password":"Admin@123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ ERRO: Falha ao obter token"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Token obtido com sucesso"
echo ""

# Função para medir tempo de endpoint
measure_endpoint() {
  local name=$1
  local url=$2
  local method=${3:-GET}
  
  echo "📊 Testando: $name"
  echo "   URL: $url"
  
  # Fazer 3 requests para ter média
  local total_time=0
  local total_size=0
  local http_code=""
  
  for i in 1 2 3; do
    RESULT=$(curl -s -w "\nTIME:%{time_total}\nSIZE:%{size_download}\nHTTP:%{http_code}\n" \
      -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      "$url" 2>&1)
    
    TIME=$(echo "$RESULT" | grep "TIME:" | cut -d: -f2)
    SIZE=$(echo "$RESULT" | grep "SIZE:" | cut -d: -f2)
    HTTP=$(echo "$RESULT" | grep "HTTP:" | cut -d: -f2)
    
    total_time=$(echo "$total_time + $TIME" | bc)
    total_size=$SIZE
    http_code=$HTTP
    
    echo "   Request $i: ${TIME}s"
  done
  
  avg_time=$(echo "scale=3; $total_time / 3" | bc)
  
  echo "   ⏱️  Tempo médio: ${avg_time}s"
  echo "   📦 Tamanho: ${total_size} bytes ($(echo "scale=2; $total_size / 1024" | bc) KB)"
  echo "   🌐 HTTP Status: $http_code"
  echo ""
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "🎯 PARTE 1: ENDPOINTS BACKEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

measure_endpoint "Health Check" "$API_BASE/../health"
measure_endpoint "Funcionários (50 registros)" "$API_BASE/funcionarios?limit=50"
measure_endpoint "Funcionários (1 registro)" "$API_BASE/funcionarios/1"
measure_endpoint "Qualificações Histórico (50 registros)" "$API_BASE/qualificacoes/historico?limit=50"
measure_endpoint "Qualificações Tipos" "$API_BASE/qualificacoes/tipos"
measure_endpoint "Qualificações Categorias" "$API_BASE/qualificacoes/categorias"
measure_endpoint "Simuladores (50 registros)" "$API_BASE/simuladores?limit=50"
measure_endpoint "Aeronaves" "$API_BASE/aeronaves"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗄️  PARTE 2: QUERIES D1 DIRETAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📊 Query 1: SELECT simples (funcionários)"
echo "   SQL: SELECT * FROM funcionarios WHERE deleted_at IS NULL LIMIT 50"
time (cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) as count FROM funcionarios WHERE deleted_at IS NULL" 2>&1 | grep -v "wrangler")
echo ""

echo "📊 Query 2: SELECT com JOIN (qualificações + funcionários)"
echo "   SQL: JOIN funcionarios + qualificacoes_historico"
time (cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) FROM qualificacoes_historico qh LEFT JOIN funcionarios f ON qh.funcionario_cpf = f.cpf WHERE qh.deleted_at IS NULL" 2>&1 | grep -v "wrangler")
echo ""

echo "📊 Query 3: View SQL (v_certificados_completos)"
echo "   SQL: SELECT * FROM v_certificados_completos LIMIT 10"
time (cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) FROM v_certificados_completos" 2>&1 | grep -v "wrangler")
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 PARTE 3: VERIFICAÇÃO DE ÍNDICES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📋 Listando índices existentes..."
cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY tbl_name" 2>&1 | grep -v "wrangler"
echo ""

echo "📋 EXPLAIN QUERY PLAN - Funcionários com deleted_at"
cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="EXPLAIN QUERY PLAN SELECT * FROM funcionarios WHERE deleted_at IS NULL LIMIT 50" 2>&1 | grep -v "wrangler"
echo ""

echo "📋 EXPLAIN QUERY PLAN - Qualificações com JOIN"
cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="EXPLAIN QUERY PLAN SELECT qh.*, f.nome FROM qualificacoes_historico qh LEFT JOIN funcionarios f ON qh.funcionario_cpf = f.cpf WHERE qh.deleted_at IS NULL LIMIT 50" 2>&1 | grep -v "wrangler"
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PARTE 4: ESTATÍSTICAS DO BANCO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "📈 Contagem de registros por tabela:"
cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust && \
  wrangler d1 execute airtrust-db --env production --remote \
  --command="
    SELECT 'funcionarios' as tabela, COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos FROM funcionarios
    UNION ALL
    SELECT 'qualificacoes_historico', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM qualificacoes_historico
    UNION ALL
    SELECT 'qualificacoes_tipos', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM qualificacoes_tipos
    UNION ALL
    SELECT 'simuladores', COUNT(*), SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) FROM simuladores
  " 2>&1 | grep -v "wrangler"
echo ""

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DIAGNÓSTICO COMPLETO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 PRÓXIMOS PASSOS MANUAIS:"
echo ""
echo "1. NETWORK WATERFALL (DevTools):"
echo "   - Abra Chrome DevTools (F12)"
echo "   - Aba Network"
echo "   - Navegue para página de Qualificações"
echo "   - Tire screenshot do waterfall"
echo "   - Anote:"
echo "     * Total de requests"
echo "     * Request mais lenta (nome + tempo)"
echo "     * Tamanho maior response (URL + KB)"
echo ""
echo "2. REACT PROFILER:"
echo "   - Abra React DevTools"
echo "   - Aba Profiler"
echo "   - Inicie gravação"
echo "   - Navegue para página lenta"
echo "   - Pare gravação"
echo "   - Anote componente com maior tempo de render"
echo ""
echo "3. REACT QUERY DEVTOOLS:"
echo "   - Abra console do navegador"
echo "   - Execute: window.__REACT_QUERY_DEVTOOLS_GLOBAL__"
echo "   - Ou adicione <ReactQueryDevtools /> no App.tsx"
echo "   - Anote queries com fetchCount > 3"
echo ""
echo "4. BUNDLE SIZE:"
echo "   - Verifique dist/client/assets/"
echo "   - Anote tamanhos dos arquivos .js principais"
echo ""
