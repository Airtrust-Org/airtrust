#!/bin/bash
# scripts/validate-data-consistency.sh
# Valida consistência de dados entre local e produção

set -e

echo "🔍 Validando consistência de dados..."
echo ""

cd worker-airtrust

# Função para executar query e extrair número
get_count() {
  local query="$1"
  local env="${2:-local}"
  
  if [ "$env" = "remote" ]; then
    npx wrangler d1 execute DB --remote --command="$query" 2>/dev/null | grep -o '[0-9]*' | tail -1 || echo "0"
  else
    npx wrangler d1 execute DB --local --command="$query" 2>/dev/null | grep -o '[0-9]*' | tail -1 || echo "0"
  fi
}

# Validações LOCAL
echo "📊 Contagem de registros (LOCAL):"
echo "  Modelos sessão: $(get_count 'SELECT COUNT(*) FROM modelos_sessao WHERE deleted_at IS NULL')"
echo "  Cadastro manobras: $(get_count 'SELECT COUNT(*) FROM cadastro_manobras WHERE deleted_at IS NULL')"
echo "  Categorias manobras: $(get_count 'SELECT COUNT(*) FROM manobras_categorias WHERE deleted_at IS NULL')"
echo "  Template manobras (sessão 4): $(get_count 'SELECT COUNT(*) FROM template_manobras WHERE template_id = 4')"
echo "  Template manobras (total): $(get_count 'SELECT COUNT(*) FROM template_manobras')"

echo ""

# Validações específicas
echo "🧪 Testes de integridade:"

# 1. Verificar se todas sessões têm 22 manobras
echo -n "  Sessões com 22 manobras: "
SESSIONS_OK=$(get_count "SELECT COUNT(DISTINCT template_id) FROM template_manobras GROUP BY template_id HAVING COUNT(*) = 22")
echo "${SESSIONS_OK}/11"

# 2. Verificar FK órfãos
echo -n "  FKs órfãos em template_manobras: "
ORPHANS=$(get_count "SELECT COUNT(*) FROM template_manobras tm WHERE NOT EXISTS (SELECT 1 FROM cadastro_manobras m WHERE m.id = tm.manobra_id)")
echo "$ORPHANS"

# 3. Verificar duplicatas
echo -n "  Duplicatas em template_manobras: "
DUPES=$(get_count "SELECT COUNT(*) FROM (SELECT template_id, manobra_id FROM template_manobras GROUP BY template_id, manobra_id HAVING COUNT(*) > 1)")
echo "$DUPES"

echo ""

# Validação final
if [ "$SESSIONS_OK" = "11" ] && [ "$ORPHANS" = "0" ] && [ "$DUPES" = "0" ]; then
  echo "✅ Todos os testes passaram!"
  exit 0
else
  echo "❌ Alguns testes falharam!"
  echo ""
  echo "💡 Execute: npm run db:seed:production"
  exit 1
fi
