#!/bin/bash

# Script de Correção Automática - Nomenclatura AirTrust
# Executa TODAS as correções de nomenclatura obsoleta

set -e

echo "🔧 Iniciando correções de nomenclatura..."

# ============================================
# 1. CORREÇÃO: habilitacoes → qualificacoes_historico (SQL)
# ============================================
echo "📝 Passo 1: Corrigindo queries SQL - habilitacoes → qualificacoes_historico"

find src/worker -type f -name "*.ts" -exec sed -i 's/FROM habilitacoes /FROM qualificacoes_historico /g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/JOIN habilitacoes /JOIN qualificacoes_historico /g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/INTO habilitacoes /INTO qualificacoes_historico /g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/UPDATE habilitacoes /UPDATE qualificacoes_historico /g' {} +
find src/worker -type f -name "*.ts" -exec sed -i "s/'habilitacoes'/'qualificacoes_historico'/g" {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/"habilitacoes"/"qualificacoes_historico"/g' {} +

# ============================================
# 2. CORREÇÃO: qualificacoes (ambíguo) → qualificacoes_tipos
# ============================================
echo "📝 Passo 2: Corrigindo queries SQL - qualificacoes → qualificacoes_tipos (onde aplicável)"

# Apenas em queries que claramente se referem ao catálogo (tabela master)
find src/worker -type f -name "*.ts" -exec sed -i 's/FROM qualificacoes WHERE/FROM qualificacoes_tipos WHERE/g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/JOIN qualificacoes ON/JOIN qualificacoes_tipos ON/g' {} +

# ============================================
# 3. CORREÇÃO: Endpoints da API
# ============================================
echo "📝 Passo 3: Corrigindo endpoints da API"

find src/worker -type f -name "*.ts" -exec sed -i "s|/api/habilitacoes|/api/qualificacoes-historico|g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|'/habilitacoes'|'/qualificacoes-historico'|g" {} +

# ============================================
# 4. CORREÇÃO: Nomes de classes e interfaces
# ============================================
echo "📝 Passo 4: Corrigindo nomes de classes e interfaces TypeScript"

find src/worker -type f -name "*.ts" -exec sed -i 's/class HabilitacoesService/class QualificacoesHistoricoService/g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/ListaHabilitacoesOptions/ListaQualificacoesHistoricoOptions/g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/HabilitacaoRow/QualificacaoHistoricoRow/g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/listHabilitacoes/listQualificacoesHistorico/g' {} +
find src/worker -type f -name "*.ts" -exec sed -i 's/obterFuncionariosComHabilitacoes/obterFuncionariosComQualificacoesHistorico/g' {} +

# ============================================
# 5. CORREÇÃO: Imports
# ============================================
echo "📝 Passo 5: Corrigindo imports"

find src/worker -type f -name "*.ts" -exec sed -i "s|from '../services/habilitacoesService'|from '../services/qualificacoesHistoricoService'|g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|from './habilitacoesService'|from './qualificacoesHistoricoService'|g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|import { HabilitacoesService }|import { QualificacoesHistoricoService }|g" {} +

# ============================================
# 6. CORREÇÃO: Variáveis e constantes
# ============================================
echo "📝 Passo 6: Corrigindo variáveis e constantes"

find src/worker -type f -name "*.ts" -exec sed -i "s/const habilitacoes/const qualificacoesHistorico/g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s/let habilitacoes/let qualificacoesHistorico/g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s/habilitacoes:/qualificacoesHistorico:/g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|habilitacoes:p|qualificacoes_historico:p|g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|'HABILITACOES'|'QUALIFICACOES_HISTORICO'|g" {} +

# ============================================
# 7. ADICIONAR: deleted_at IS NULL em queries SELECT
# ============================================
echo "📝 Passo 7: Verificando filtros de soft delete (manual necessário)"
echo "⚠️  Aviso: Queries SELECT sem 'deleted_at IS NULL' precisam ser corrigidas manualmente"

# Buscar queries problemáticas
echo "Queries que podem precisar de deleted_at IS NULL:"
grep -r "SELECT.*FROM qualificacoes_historico WHERE" src/worker/ | grep -v "deleted_at IS NULL" || echo "✅ Nenhuma encontrada (ou já corrigidas)"

# ============================================
# 8. RENOMEAR ARQUIVOS
# ============================================
echo "📝 Passo 8: Renomeando arquivos físicos"

# Renomear service
if [ -f src/worker/services/habilitacoesService.ts ]; then
    mv src/worker/services/habilitacoesService.ts src/worker/services/qualificacoesHistoricoService.ts
    echo "✅ Renomeado: habilitacoesService.ts → qualificacoesHistoricoService.ts"
fi

# Renomear rotas
if [ -f src/worker/routes/habilitacoes.ts ]; then
    mv src/worker/routes/habilitacoes.ts src/worker/routes/qualificacoes-historico.ts
    echo "✅ Renomeado: habilitacoes.ts → qualificacoes-historico.ts"
fi

# Renomear DTOs
if [ -f src/worker/dtos/habilitacoes.ts ]; then
    mv src/worker/dtos/habilitacoes.ts src/worker/dtos/qualificacoes-historico.ts
    echo "✅ Renomeado: habilitacoes.ts → qualificacoes-historico.ts"
fi

# Renomear API
if [ -f src/worker/api/habilitacoes.ts ]; then
    mv src/worker/api/habilitacoes.ts src/worker/api/qualificacoes-historico.ts
    echo "✅ Renomeado: habilitacoes.ts → qualificacoes-historico.ts"
fi

# ============================================
# 9. CORRIGIR: imports nos arquivos que usam os arquivos renomeados
# ============================================
echo "📝 Passo 9: Atualizando imports após rename"

find src/worker -type f -name "*.ts" -exec sed -i "s|from '../api/habilitacoes'|from '../api/qualificacoes-historico'|g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|from '../routes/habilitacoes'|from '../routes/qualificacoes-historico'|g" {} +
find src/worker -type f -name "*.ts" -exec sed -i "s|from '../dtos/habilitacoes'|from '../dtos/qualificacoes-historico'|g" {} +

# ============================================
# 10. DELETAR: arquivos obsoletos (*Fixed.ts, *.bak, etc.)
# ============================================
echo "📝 Passo 10: Removendo arquivos obsoletos"

find src/worker -name "*Fixed.ts" -delete
find src/worker -name "*.bak" -delete
find src/worker -name "*.backup*" -delete

echo "✅ Arquivos obsoletos removidos"

# ============================================
# RESUMO
# ============================================
echo ""
echo "============================================"
echo "✅ CORREÇÕES CONCLUÍDAS!"
echo "============================================"
echo ""
echo "📋 Resumo das mudanças:"
echo "  - habilitacoes → qualificacoes_historico (SQL, classes, variáveis)"
echo "  - qualificacoes (ambíguo) → qualificacoes_tipos (onde aplicável)"
echo "  - Endpoints /api/habilitacoes → /api/qualificacoes-historico"
echo "  - Classes HabilitacoesService → QualificacoesHistoricoService"
echo "  - Arquivos renomeados (services, routes, dtos, api)"
echo "  - Imports atualizados"
echo "  - Arquivos obsoletos deletados"
echo ""
echo "⚠️  AÇÃO MANUAL NECESSÁRIA:"
echo "  1. Revisar queries SELECT e adicionar 'deleted_at IS NULL' onde necessário"
echo "  2. Atualizar src/worker/routes/index.ts com novos imports"
echo "  3. Testar: npm run build"
echo "  4. Testar: npm run dev:worker"
echo ""
echo "🔍 Para verificar se restaram problemas:"
echo "  grep -r 'habilitacoes' src/worker/"
echo "  grep -r 'FROM qualificacoes WHERE' src/worker/"
echo ""
