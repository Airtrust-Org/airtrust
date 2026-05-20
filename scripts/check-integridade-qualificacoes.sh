#!/bin/bash

echo "🔍 VERIFICANDO INTEGRIDADE: tipos_qualificacoes ↔ qualificacoes"
echo "================================================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  Wrangler não encontrado. Usando queries locais..."
    USE_LOCAL=true
else
    USE_LOCAL=false
fi

echo "1️⃣ QUALIFICAÇÕES ÓRFÃS (sem tipo correspondente):"
echo "   Buscando qualificações com código inexistente em tipos_qualificacoes..."
echo ""

# Query para encontrar órfãs
QUERY_ORFAS="
SELECT DISTINCT q.codigo, COUNT(*) as total
FROM qualificacoes q
LEFT JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE tq.codigo IS NULL
  AND q.deleted_at IS NULL
GROUP BY q.codigo
ORDER BY total DESC
LIMIT 10;
"

if [ "$USE_LOCAL" = false ]; then
    orfas=$(wrangler d1 execute airtrust-db --command "$QUERY_ORFAS" --remote 2>/dev/null | grep -oE '[0-9]+' | head -1)
else
    echo "   ⚠️  Execute manualmente no banco:"
    echo "   $QUERY_ORFAS"
    orfas=0
fi

if [ -z "$orfas" ]; then
    orfas=0
fi

if [ "$orfas" -gt 0 ]; then
    echo -e "   ${RED}❌ $orfas qualificações órfãs encontradas!${NC}"
    echo "   Ação: Execute a migration 1032_integridade_tipos_qualificacoes.sql"
else
    echo -e "   ${GREEN}✅ Nenhuma qualificação órfã${NC}"
fi
echo ""

echo "2️⃣ TIPOS OCIOSOS (sem qualificações):"
echo "   Buscando tipos sem nenhuma qualificação vinculada..."
echo ""

QUERY_OCIOSOS="
SELECT COUNT(*) as total
FROM tipos_qualificacoes tq
LEFT JOIN qualificacoes q ON q.codigo = tq.codigo AND q.deleted_at IS NULL
WHERE q.id IS NULL AND tq.deleted_at IS NULL;
"

if [ "$USE_LOCAL" = false ]; then
    ociosos=$(wrangler d1 execute airtrust-db --command "$QUERY_OCIOSOS" --remote 2>/dev/null | grep -oE '[0-9]+' | head -1)
else
    ociosos=0
fi

if [ -z "$ociosos" ]; then
    ociosos=0
fi

echo -e "   ${YELLOW}ℹ️  $ociosos tipos sem qualificações${NC} (OK se tipos novos)"
echo ""

echo "3️⃣ INTEGRIDADE GERAL:"
echo "   Verificando vinculação entre tabelas..."
echo ""

QUERY_INTEGRADO="
SELECT COUNT(DISTINCT q.codigo) as total
FROM qualificacoes q
INNER JOIN tipos_qualificacoes tq ON tq.codigo = q.codigo AND tq.deleted_at IS NULL
WHERE q.deleted_at IS NULL;
"

if [ "$USE_LOCAL" = false ]; then
    integrado=$(wrangler d1 execute airtrust-db --command "$QUERY_INTEGRADO" --remote 2>/dev/null | grep -oE '[0-9]+' | head -1)
else
    integrado=0
fi

if [ -z "$integrado" ]; then
    integrado=0
fi

echo -e "   ${GREEN}✅ $integrado tipos com qualificações vinculadas corretamente${NC}"
echo ""

echo "4️⃣ TRIGGERS INSTALADOS:"
echo "   Verificando triggers de validação..."
echo ""

QUERY_TRIGGERS="
SELECT name FROM sqlite_master 
WHERE type='trigger' 
  AND name LIKE '%qualificacao%'
ORDER BY name;
"

if [ "$USE_LOCAL" = false ]; then
    triggers=$(wrangler d1 execute airtrust-db --command "$QUERY_TRIGGERS" --remote 2>/dev/null | grep -c "validate_qualificacao")
else
    triggers=0
fi

if [ "$triggers" -ge 2 ]; then
    echo -e "   ${GREEN}✅ Triggers de validação instalados${NC}"
else
    echo -e "   ${RED}❌ Triggers não encontrados!${NC}"
    echo "   Ação: Execute a migration 1032_integridade_tipos_qualificacoes.sql"
fi
echo ""

echo "================================================================"
echo "📊 RESUMO:"
echo ""
echo "   Qualificações órfãs: $orfas"
echo "   Tipos ociosos: $ociosos"
echo "   Tipos integrados: $integrado"
echo "   Triggers: $([ "$triggers" -ge 2 ] && echo 'OK' || echo 'FALTANDO')"
echo ""

# Resultado final
if [ "$orfas" -gt 0 ] || [ "$triggers" -lt 2 ]; then
    echo -e "${RED}⚠️  AÇÃO NECESSÁRIA:${NC}"
    echo ""
    echo "   1. Aplicar migration:"
    echo "      wrangler d1 execute airtrust-db --file=migrations/1032_integridade_tipos_qualificacoes.sql --remote"
    echo ""
    echo "   2. Verificar tipos criados automaticamente:"
    echo "      SELECT * FROM tipos_qualificacoes WHERE descricao LIKE '%Criado automaticamente%';"
    echo ""
    echo "   3. Executar este script novamente para confirmar"
    echo ""
    exit 1
else
    echo -e "${GREEN}✅ INTEGRIDADE OK!${NC}"
    echo ""
    echo "   Todas as qualificações têm tipos correspondentes"
    echo "   Triggers de validação estão ativos"
    echo "   Sistema protegido contra inconsistências"
    echo ""
    exit 0
fi
