#!/bin/bash
set -e

echo "🔧 REFACTOR: qualificacoes → qualificacoes_tipos"
echo "=============================================="

# 1. SUBSTITUIR em todos os arquivos .ts (preservando qualificacoes_historico)
echo "📝 Atualizando SQL queries..."

find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/FROM qualificacoes WHERE/FROM qualificacoes_tipos WHERE/g' \
  -e 's/FROM qualificacoes q/FROM qualificacoes_tipos q/g' \
  -e 's/JOIN qualificacoes WHERE/JOIN qualificacoes_tipos WHERE/g' \
  -e 's/JOIN qualificacoes q ON/JOIN qualificacoes_tipos q ON/g' \
  -e 's/LEFT JOIN qualificacoes q/LEFT JOIN qualificacoes_tipos q/g' \
  -e 's/INNER JOIN qualificacoes q/INNER JOIN qualificacoes_tipos q/g' \
  -e 's/INTO qualificacoes (/INTO qualificacoes_tipos (/g' \
  -e 's/UPDATE qualificacoes SET/UPDATE qualificacoes_tipos SET/g' \
  -e 's/UPDATE qualificacoes WHERE/UPDATE qualificacoes_tipos WHERE/g' \
  -e 's/INSERT INTO qualificacoes (/INSERT INTO qualificacoes_tipos (/g' \
  {} +

# 2. Corrigir comentários nas queries
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's|tabela qualificacoes|tabela qualificacoes_tipos|g' \
  -e 's|qualificacoes (catálogo)|qualificacoes_tipos (catálogo)|g' \
  {} +

echo "✅ SQL queries atualizadas em src/worker/**/*.ts"

# 3. RENOMEAR arquivos -v2
echo ""
echo "📦 Renomeando arquivos -v2..."

if [ -f "src/worker/routes/certificados-v2.ts" ]; then
  git mv "src/worker/routes/certificados-v2.ts" "src/worker/routes/certificados.ts"
  echo "✅ certificados-v2.ts → certificados.ts"
fi

if [ -f "src/worker/routes/empresas-v2.ts" ]; then
  git mv "src/worker/routes/empresas-v2.ts" "src/worker/routes/empresas.ts"
  echo "✅ empresas-v2.ts → empresas.ts"
fi

# 4. ATUALIZAR imports
echo ""
echo "📝 Atualizando imports..."

find src -type f \( -name "*.ts" -o -name "*.tsx" \) -exec sed -i '' \
  -e "s|from './certificados-v2'|from './certificados'|g" \
  -e "s|from '../routes/certificados-v2'|from '../routes/certificados'|g" \
  -e "s|import certificadosV2 from|import certificados from|g" \
  -e "s|certificadosV2|certificados|g" \
  -e "s|from './empresas-v2'|from './empresas'|g" \
  -e "s|from '../routes/empresas-v2'|from '../routes/empresas'|g" \
  -e "s|import empresasV2 from|import empresas from|g" \
  -e "s|empresasV2|empresas|g" \
  {} +

echo "✅ Imports atualizados"

# 5. LIMPAR comentários obsoletos com /v2/
echo ""
echo "🧹 Limpando comentários obsoletos..."

find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's|/api/v2/||g' \
  -e 's|GET /v2/|GET /|g' \
  -e 's|POST /v2/|POST /|g' \
  -e 's|PUT /v2/|PUT /|g' \
  -e 's|DELETE /v2/|DELETE /|g' \
  {} +

echo "✅ Comentários atualizados"

echo ""
echo "✅ REFACTOR COMPLETO!"
echo ""
echo "📋 Próximos passos:"
echo "  1. npx tsc --noEmit (verificar erros)"
echo "  2. npm run build (compilar)"
echo "  3. Aplicar migration: wrangler d1 execute --command='ALTER TABLE qualificacoes RENAME TO qualificacoes_tipos'"
echo "  4. wrangler deploy"
