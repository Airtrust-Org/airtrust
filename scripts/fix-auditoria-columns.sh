#!/bin/bash

echo "🔧 CORRIGINDO COLUNAS DE AUDITORIA"
echo "======================================"
echo ""

# Backup
echo "📦 Criando backup..."
git add -A
git stash push -m "backup antes de fix auditoria $(date +%Y%m%d-%H%M%S)"
echo "   ✅ Backup criado"
echo ""

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
echo "♻️  Execute 'git stash pop' para desfazer se necessário"
