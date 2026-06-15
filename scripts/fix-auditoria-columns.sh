#!/usr/bin/env bash
set -euo pipefail

echo "🔧 CORRIGINDO COLUNAS DE AUDITORIA"
echo "======================================"
echo ""

if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working tree suja. Este script altera arquivos em massa."
    echo "   Faça backup/stage seletivo manualmente e rode novamente em uma árvore limpa."
    exit 1
fi

# Encontrar arquivos com INSERT INTO auditoriaavancadav2
echo "🔍 Procurando arquivos com auditoria..."
FILES=$(grep -rl "INSERT INTO auditoriaavancadav2" src/worker --include="*.ts" 2>/dev/null)

COUNT=0
for file in $FILES; do
    if grep -q "action.*module.*target_record" "$file"; then
        echo "   📝 Corrigindo: $file"
        
        # Substituir padrões
        # Padrão 1: action, module, target_record_id, after_data
        sed -i '' 's/INSERT INTO auditoriaavancadav2 ([[:space:]]*action, module, target_record_id, after_data[[:space:]]*)/INSERT INTO auditoriaavancadav2 (acao, detalhes)/g' "$file"
        
        # Padrão 2: action, module, target_record_id, before_data, after_data
        sed -i '' 's/INSERT INTO auditoriaavancadav2 ([[:space:]]*action, module, target_record_id, before_data, after_data[[:space:]]*)/INSERT INTO auditoriaavancadav2 (acao, detalhes)/g' "$file"
        
        # Padrão 3: action, module, target_record_id, before_data
        sed -i '' 's/INSERT INTO auditoriaavancadav2 ([[:space:]]*action, module, target_record_id, before_data[[:space:]]*)/INSERT INTO auditoriaavancadav2 (acao, detalhes)/g' "$file"
        
        # Ajustar VALUES para JSON
        # Isso precisa ser feito manualmente pois é complexo
        
        COUNT=$((COUNT + 1))
    fi
done

echo ""
echo "======================================"
echo "✅ $COUNT arquivo(s) identificado(s)"
echo ""
echo "⚠️  ATENÇÃO: Os VALUES precisam ser ajustados manualmente!"
echo "   Substitua: VALUES ('ACTION', 'module', id, data)"
echo "   Por: VALUES ('ACTION_MODULE', json_object('id', id, 'data', data))"
echo ""
echo "🔍 Execute 'git diff' para ver as mudanças"
echo "♻️  Use git diff e reverta seletivamente se necessário"
