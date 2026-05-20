#!/bin/bash
# Script para atualizar todas as referências de codigo_aeronave para modelo_aeronave
# Data: 2026-01-13

echo "🔄 Atualizando referências de codigo_aeronave para modelo_aeronave..."

# Diretório base
BASE_DIR="/Users/filipedaumas/Documents/airtrust v1"

# Backup
echo "📦 Criando backup..."
BACKUP_DIR="$BASE_DIR/_backups/refactor_aeronaves_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Copiar arquivos TypeScript que serão modificados
find "$BASE_DIR/worker-airtrust/src" -name "*.ts" -exec cp --parents {} "$BACKUP_DIR" \;
find "$BASE_DIR/src/react-app" -name "*.tsx" -name "*.ts" -exec cp --parents {} "$BACKUP_DIR" \;

echo "✅ Backup criado em: $BACKUP_DIR"

# Substituições em arquivos TypeScript da API
echo "🔧 Atualizando arquivos da API..."

# 1. Substituir codigo_aeronave por modelo_aeronave em todo o código
find "$BASE_DIR/worker-airtrust/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/codigo_aeronave/modelo_aeronave/g' {} \;

# 2. Substituir aeronave_codigo por modelo_aeronave (casos específicos)
find "$BASE_DIR/worker-airtrust/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/aeronave_codigo/modelo_aeronave/g' {} \;

# 3. Atualizar comentários que mencionam "código da aeronave" ou "código de aeronave"
find "$BASE_DIR/worker-airtrust/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/código da aeronave/modelo de aeronave/g' {} \;
find "$BASE_DIR/worker-airtrust/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/código de aeronave/modelo de aeronave/g' {} \;
find "$BASE_DIR/worker-airtrust/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/Código da aeronave/Modelo de aeronave/g' {} \;

# Substituições em arquivos React
echo "⚛️  Atualizando componentes React..."

find "$BASE_DIR/src/react-app" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/codigo_aeronave/modelo_aeronave/g' {} \;
find "$BASE_DIR/src/react-app" -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' 's/aeronave_codigo/modelo_aeronave/g' {} \;

echo "✅ Substituições concluídas!"

# Listar arquivos modificados
echo "📝 Arquivos modificados:"
find "$BASE_DIR/worker-airtrust/src" -type f \( -name "*.ts" -o -name "*.tsx" \) -mmin -1 | wc -l
find "$BASE_DIR/src/react-app" -type f \( -name "*.ts" -o -name "*.tsx" \) -mmin -1 | wc -l

echo "🎉 Refatoração concluída!"
echo "💡 Revise os arquivos e execute os testes antes de commitar."
echo "🔙 Backup disponível em: $BACKUP_DIR"
