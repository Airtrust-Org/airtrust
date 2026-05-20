#!/bin/bash

echo "🔍 AUDITORIA PROFUNDA DO SISTEMA AIRTRUST"
echo "========================================"
echo ""

# 1. Arquivos ARCHIVE (obsoletos)
echo "📁 1. ARQUIVOS OBSOLETOS (ARCHIVE):"
find src -type d -name "ARCHIVE" -o -name "archive" | while read dir; do
  count=$(find "$dir" -type f | wc -l)
  echo "  - $dir ($count arquivos)"
done
echo ""

# 2. Arquivos com @ts-nocheck (problemas de tipo)
echo "⚠️  2. ARQUIVOS COM @ts-nocheck:"
grep -r "@ts-nocheck" src --include="*.ts" --include="*.tsx" -l | wc -l
echo "  Total de arquivos ignorando verificação de tipos"
echo ""

# 3. Endpoints duplicados
echo "🔄 3. POSSÍVEIS ENDPOINTS DUPLICADOS:"
echo "  Verificando rotas registradas..."
grep -r "app.route\|app.get\|app.post" src/worker/routes --include="*.ts" | grep -v "//" | head -20
echo ""

# 4. Queries SQL com colunas potencialmente problemáticas
echo "🗄️  4. QUERIES SQL SUSPEITAS:"
echo "  Procurando por 'SELECT *' (má prática):"
grep -r "SELECT \*" src/worker/api --include="*.ts" | wc -l
echo "  queries encontradas"
echo ""

# 5. Alertas ainda presentes
echo "🔔 5. ALERTAS RESTANTES NO CÓDIGO:"
grep -r "alert(" src/react-app --include="*.tsx" --include="*.ts" | grep -v "// " | wc -l
echo "  alertas encontrados"
echo ""

# 6. Console.log em produção
echo "📝 6. CONSOLE.LOG EM PRODUÇÃO:"
grep -r "console.log\|console.error\|console.warn" src/worker/api --include="*.ts" | wc -l
echo "  logs encontrados"
echo ""

# 7. Imports não utilizados
echo "📦 7. VERIFICANDO ESTRUTURA:"
echo "  Total de arquivos TypeScript:"
find src -name "*.ts" -o -name "*.tsx" | wc -l
echo "  Total de componentes React:"
find src/react-app/components -name "*.tsx" | wc -l
echo "  Total de páginas React:"
find src/react-app/pages -name "*.tsx" | wc -l
echo ""

# 8. Migrations
echo "🔧 8. MIGRATIONS:"
echo "  Total de migrations:"
find migrations -name "*.sql" | wc -l
echo "  Migrations desabilitadas:"
find migrations -name "*.disabled" | wc -l
echo ""

# 9. Tamanho do projeto
echo "📊 9. TAMANHO DO PROJETO:"
echo "  Linhas de código TypeScript:"
find src -name "*.ts" -o -name "*.tsx" | xargs wc -l | tail -1
echo ""

echo "✅ AUDITORIA CONCLUÍDA"
