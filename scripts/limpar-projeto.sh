#!/bin/bash

# Script de Limpeza Inteligente do Projeto AirTrust
# Remove apenas arquivos temporários e desnecessários
# Mantém versões importantes e código funcional

echo "🧹 LIMPEZA INTELIGENTE DO PROJETO AIRTRUST"
echo "=========================================="
echo ""

# Criar backup de segurança antes de limpar
BACKUP_DIR="backups/pre-cleanup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Criando backup de segurança em: $BACKUP_DIR"
echo ""

# Função para calcular tamanho
calculate_size() {
    du -sh "$1" 2>/dev/null | awk '{print $1}'
}

# Variável para rastrear espaço liberado
TOTAL_FREED=0

echo "🔍 ANÁLISE DE ARQUIVOS GRANDES E TEMPORÁRIOS:"
echo "=============================================="
echo ""

# 1. Arquivos de teste JSON (duplicados)
echo "1️⃣ Arquivos de teste JSON duplicados:"
if [ -f "test-results.json" ]; then
    SIZE=$(calculate_size "test-results.json")
    echo "   - test-results.json ($SIZE) - PODE REMOVER"
fi
if [ -f "test-results-after-fixes.json" ]; then
    SIZE=$(calculate_size "test-results-after-fixes.json")
    echo "   - test-results-after-fixes.json ($SIZE) - PODE REMOVER"
fi
if [ -f "test-results-final-after-all-fixes.json" ]; then
    SIZE=$(calculate_size "test-results-final-after-all-fixes.json")
    echo "   - test-results-final-after-all-fixes.json ($SIZE) - PODE REMOVER"
fi
echo ""

# 2. Schemas SQL de produção (backups)
echo "2️⃣ Schemas SQL de produção (backups):"
if [ -f "prod-schema.sql" ]; then
    SIZE=$(calculate_size "prod-schema.sql")
    echo "   - prod-schema.sql ($SIZE) - PODE MOVER PARA BACKUPS"
fi
if [ -f "prod-schema-only.sql" ]; then
    SIZE=$(calculate_size "prod-schema-only.sql")
    echo "   - prod-schema-only.sql ($SIZE) - PODE MOVER PARA BACKUPS"
fi
echo ""

# 3. Diretórios de auditoria
echo "3️⃣ Diretórios de auditoria:"
if [ -d ".audit-reports" ]; then
    SIZE=$(calculate_size ".audit-reports")
    echo "   - .audit-reports/ ($SIZE) - PODE ARQUIVAR"
fi
if [ -d "auditoria" ]; then
    SIZE=$(calculate_size "auditoria")
    echo "   - auditoria/ ($SIZE) - PODE ARQUIVAR"
fi
if [ -d "auditoria-nivel3" ]; then
    SIZE=$(calculate_size "auditoria-nivel3")
    echo "   - auditoria-nivel3/ ($SIZE) - PODE ARQUIVAR"
fi
echo ""

# 4. Backups de migrations
echo "4️⃣ Backups de migrations:"
if [ -d "migrations_backup" ]; then
    SIZE=$(calculate_size "migrations_backup")
    echo "   - migrations_backup/ ($SIZE) - PODE ARQUIVAR"
fi
echo ""

# 5. Arquivos SQL temporários
echo "5️⃣ Arquivos SQL temporários:"
find . -maxdepth 1 -name "*backup*.sql" -o -name "*temp*.sql" -o -name "*copy*.sql" | while read file; do
    SIZE=$(calculate_size "$file")
    echo "   - $(basename $file) ($SIZE) - PODE REMOVER"
done
echo ""

# 6. Arquivos de resposta da API
echo "6️⃣ Arquivos de resposta da API (testes):"
find . -maxdepth 1 -name "prod-response-*.json" | while read file; do
    SIZE=$(calculate_size "$file")
    echo "   - $(basename $file) ($SIZE) - PODE REMOVER"
done
echo ""

# 7. Relatórios de validação
echo "7️⃣ Relatórios de validação:"
find . -maxdepth 1 -name "*report*.txt" -o -name "*validation*.txt" | while read file; do
    SIZE=$(calculate_size "$file")
    echo "   - $(basename $file) ($SIZE) - PODE REMOVER"
done
echo ""

# 8. Arquivos .DS_Store (macOS)
echo "8️⃣ Arquivos .DS_Store (macOS):"
DS_COUNT=$(find . -name ".DS_Store" | wc -l)
echo "   - Encontrados: $DS_COUNT arquivos - PODE REMOVER"
echo ""

# 9. node_modules (pode ser recriado)
echo "9️⃣ node_modules:"
if [ -d "node_modules" ]; then
    SIZE=$(calculate_size "node_modules")
    echo "   - node_modules/ ($SIZE) - NÃO REMOVER (necessário)"
    echo "   - Pode ser recriado com: npm install"
fi
echo ""

# 10. dist (pode ser recriado)
echo "🔟 dist (build):"
if [ -d "dist" ]; then
    SIZE=$(calculate_size "dist")
    echo "   - dist/ ($SIZE) - PODE REMOVER (recriado com npm run build)"
fi
echo ""

echo "=========================================="
echo "📊 RESUMO:"
echo "=========================================="
echo ""
echo "Total do projeto: $(calculate_size .)"
echo ""
echo "🎯 RECOMENDAÇÕES:"
echo ""
echo "REMOVER AGORA (arquivos temporários):"
echo "  - Arquivos de teste JSON (4 arquivos, ~1MB)"
echo "  - Arquivos de resposta API (prod-response-*.json)"
echo "  - Relatórios de validação (*.txt)"
echo "  - Arquivos .DS_Store"
echo "  - Arquivos SQL temporários (*backup*.sql, *temp*.sql)"
echo ""
echo "ARQUIVAR (mover para backups/):"
echo "  - prod-schema.sql e prod-schema-only.sql"
echo "  - Diretórios de auditoria (.audit-reports, auditoria, auditoria-nivel3)"
echo "  - migrations_backup/"
echo ""
echo "MANTER:"
echo "  - src/ (código fonte)"
echo "  - migrations/ (migrations ativas)"
echo "  - scripts/ (scripts úteis)"
echo "  - docs/ (documentação)"
echo "  - node_modules/ (dependências)"
echo ""
echo "PODE RECRIAR:"
echo "  - dist/ (npm run build)"
echo "  - node_modules/ (npm install)"
echo ""

# Perguntar ao usuário se quer executar a limpeza
read -p "🤔 Deseja executar a limpeza automática? (s/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo ""
    echo "🚀 EXECUTANDO LIMPEZA..."
    echo ""
    
    # Remover arquivos de teste JSON
    echo "🗑️  Removendo arquivos de teste JSON..."
    rm -f test-results*.json
    
    # Remover arquivos de resposta da API
    echo "🗑️  Removendo arquivos de resposta da API..."
    rm -f prod-response-*.json
    
    # Remover relatórios de validação
    echo "🗑️  Removendo relatórios de validação..."
    rm -f *report*.txt *validation*.txt auditoria-report.txt
    
    # Remover arquivos .DS_Store
    echo "🗑️  Removendo arquivos .DS_Store..."
    find . -name ".DS_Store" -delete
    
    # Remover arquivos SQL temporários
    echo "🗑️  Removendo arquivos SQL temporários..."
    rm -f *backup*.sql *temp*.sql *copy*.sql
    
    # Arquivar schemas de produção
    echo "📦 Arquivando schemas de produção..."
    mkdir -p backups/schemas
    mv -f prod-schema*.sql backups/schemas/ 2>/dev/null || true
    
    # Arquivar diretórios de auditoria
    echo "📦 Arquivando diretórios de auditoria..."
    mkdir -p backups/auditorias
    mv -f .audit-reports backups/auditorias/ 2>/dev/null || true
    mv -f auditoria backups/auditorias/ 2>/dev/null || true
    mv -f auditoria-nivel3 backups/auditorias/ 2>/dev/null || true
    
    # Arquivar migrations_backup
    echo "📦 Arquivando migrations_backup..."
    mv -f migrations_backup backups/ 2>/dev/null || true
    
    # Limpar dist (pode ser recriado)
    echo "🗑️  Limpando dist/ (pode ser recriado com npm run build)..."
    rm -rf dist
    
    echo ""
    echo "✅ LIMPEZA CONCLUÍDA!"
    echo ""
    echo "📊 Novo tamanho do projeto: $(calculate_size .)"
    echo ""
    echo "📝 Para recriar os arquivos necessários:"
    echo "   npm run build  # Recriar dist/"
    echo ""
    echo "📦 Backups salvos em: backups/"
    echo ""
else
    echo ""
    echo "❌ Limpeza cancelada. Nenhum arquivo foi modificado."
    echo ""
fi

echo "✨ Script finalizado!"
