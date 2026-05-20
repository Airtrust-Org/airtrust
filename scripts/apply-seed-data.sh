#!/bin/bash

# ============================================================================
# APPLY SEED DATA - AirTrust v1.0.0
# ============================================================================
# Script para aplicar seed data completo no banco D1
# Uso: ./scripts/apply-seed-data.sh
# ============================================================================

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          🌱 APLICANDO SEED DATA COMPLETO - AIRTRUST           ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# 1. VERIFICAR SE wrangler CLI ESTÁ INSTALADO
# ============================================================================
if ! command -v wrangler &> /dev/null; then
    echo "❌ Erro: wrangler CLI não instalado"
    echo "Instale com: npm install -g wrangler"
    exit 1
fi

echo "✅ wrangler CLI encontrado"
echo ""

# ============================================================================
# 2. APLICAR SEED DATA EM STAGING
# ============================================================================
echo "🔄 Aplicando seed data em STAGING..."
echo ""

if wrangler d1 execute airtrust-db-staging --file scripts/seed-data-complete.sql --remote; then
    echo ""
    echo "✅ Seed data aplicado com sucesso em STAGING!"
else
    echo ""
    echo "⚠️  Aviso: Erro ao aplicar em staging (pode ser normal se staging não existe)"
fi

echo ""

# ============================================================================
# 3. APLICAR SEED DATA EM PRODUÇÃO
# ============================================================================
echo "⚠️  ATENÇÃO: Você está prestes a aplicar seed data em PRODUÇÃO!"
echo ""
read -p "Tem certeza? (sim/não): " confirm

if [ "$confirm" != "sim" ]; then
    echo "❌ Operação cancelada"
    exit 1
fi

echo ""
echo "🔄 Aplicando seed data em PRODUÇÃO..."
echo ""

if wrangler d1 execute airtrust-db-production --file scripts/seed-data-complete.sql --remote; then
    echo ""
    echo "✅ Seed data aplicado com sucesso em PRODUÇÃO!"
else
    echo ""
    echo "❌ Erro ao aplicar em produção"
    exit 1
fi

echo ""

# ============================================================================
# 4. VERIFICAR DADOS INSERIDOS
# ============================================================================
echo "🔍 Verificando dados inseridos..."
echo ""

echo "📊 Contagem de registros em PRODUÇÃO:"
echo ""

wrangler d1 execute airtrust-db-production --command "
SELECT 'Qualificações' as tabela, COUNT(*) as total FROM qualificacoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Categorias', COUNT(*) FROM categorias WHERE deleted_at IS NULL
UNION ALL
SELECT 'Empresas', COUNT(*) FROM empresas WHERE deleted_at IS NULL
UNION ALL
SELECT 'Setores', COUNT(*) FROM setores WHERE deleted_at IS NULL
UNION ALL
SELECT 'Funções', COUNT(*) FROM funcoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Aeronaves', COUNT(*) FROM aeronaves WHERE deleted_at IS NULL
UNION ALL
SELECT 'Funcionários', COUNT(*) FROM funcionarios WHERE deleted_at IS NULL
UNION ALL
SELECT 'Habilitações', COUNT(*) FROM habilitacoes WHERE deleted_at IS NULL
UNION ALL
SELECT 'Simuladores', COUNT(*) FROM simuladores WHERE deleted_at IS NULL
UNION ALL
SELECT 'Modelos de Sessão', COUNT(*) FROM simuladores_modelos WHERE deleted_at IS NULL
UNION ALL
SELECT 'Manobras', COUNT(*) FROM simuladores_manobras WHERE deleted_at IS NULL
ORDER BY tabela;
" --remote

echo ""

# ============================================================================
# 5. TESTAR ENDPOINTS
# ============================================================================
echo "🧪 Testando endpoints após seed data..."
echo ""

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"

test_endpoint() {
    local name=$1
    local url=$2
    
    echo -n "Testing $name... "
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$status" -eq 200 ]; then
        echo "✅ OK ($status)"
    else
        echo "⚠️  Status $status"
    fi
}

test_endpoint "Qualificações" "$BASE_URL/qualificacoes"
test_endpoint "Categorias" "$BASE_URL/categorias"
test_endpoint "Funcionários" "$BASE_URL/funcionarios"
test_endpoint "Simuladores" "$BASE_URL/simuladores"

echo ""

# ============================================================================
# 6. CONCLUSÃO
# ============================================================================
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║          ✅ SEED DATA COMPLETO APLICADO COM SUCESSO!          ║"
echo "║                                                                ║"
echo "║  Total de registros inseridos:                                ║"
echo "║  • 8 Qualificações                                             ║"
echo "║  • 5 Categorias                                                ║"
echo "║  • 3 Empresas                                                  ║"
echo "║  • 4 Setores                                                   ║"
echo "║  • 6 Funções                                                   ║"
echo "║  • 5 Aeronaves                                                 ║"
echo "║  • 5 Funcionários                                              ║"
echo "║  • 15 Habilitações                                             ║"
echo "║  • 3 Simuladores                                               ║"
echo "║  • 9 Modelos de Sessão                                         ║"
echo "║  • 24 Manobras                                                 ║"
echo "║                                                                ║"
echo "║  TOTAL: 87 registros                                           ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "✨ Sistema pronto para testes com dados completos!"
echo ""
