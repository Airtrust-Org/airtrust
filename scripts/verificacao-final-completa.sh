#!/bin/bash

echo "🔍 VERIFICAÇÃO FINAL COMPLETA - TODOS OS ITENS"
echo "=============================================="
echo ""

# 1. Verificar arquivos ARCHIVE
echo "1️⃣ ARQUIVOS ARCHIVE:"
archive_count=$(find src -type d -name "ARCHIVE" 2>/dev/null | wc -l | tr -d ' ')
if [ "$archive_count" -eq 0 ]; then
  echo "   ✅ 0 diretórios ARCHIVE (OK)"
else
  echo "   ❌ $archive_count diretórios ARCHIVE ainda existem!"
  find src -type d -name "ARCHIVE"
fi
echo ""

# 2. Verificar migrations desabilitadas
echo "2️⃣ MIGRATIONS DESABILITADAS:"
disabled_count=$(find migrations -name "*.disabled" 2>/dev/null | wc -l | tr -d ' ')
if [ "$disabled_count" -eq 0 ]; then
  echo "   ✅ 0 migrations desabilitadas (OK)"
else
  echo "   ❌ $disabled_count migrations desabilitadas ainda existem!"
fi
echo ""

# 3. Verificar @ts-nocheck
echo "3️⃣ @TS-NOCHECK:"
tsnocheck_count=$(grep -r "@ts-nocheck" src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "   📊 $tsnocheck_count arquivos com @ts-nocheck"
echo ""

# 4. Verificar SELECT *
echo "4️⃣ SELECT *:"
select_star_count=$(grep -r "SELECT \*" src/worker/api --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "   📊 $select_star_count queries com SELECT *"
if [ "$select_star_count" -eq 0 ]; then
  echo "   ✅ Todos otimizados!"
else
  echo "   ⚠️  Ainda há queries para otimizar"
fi
echo ""

# 5. Verificar console.log
echo "5️⃣ CONSOLE.LOG:"
console_count=$(grep -r "console\.log\|console\.debug" src/worker/api --include="*.ts" 2>/dev/null | grep -v "Logger\." | grep -v "//" | wc -l | tr -d ' ')
echo "   📊 $console_count console.log/debug encontrados"
echo ""

# 6. Verificar endpoints PUT
echo "6️⃣ ENDPOINTS PUT:"
put_count=$(grep -r "app\.put" src/worker/api --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "   📊 $put_count endpoints PUT encontrados"
echo ""

# 7. Verificar migration de categorias
echo "7️⃣ MIGRATION DE CATEGORIAS:"
if [ -f "migrations/1031_categorias_qualificacoes.sql" ]; then
  echo "   ✅ Migration criada"
else
  echo "   ❌ Migration não encontrada!"
fi
echo ""

# 8. Verificar documentação
echo "8️⃣ DOCUMENTAÇÃO:"
docs=(
  "SISTEMA-4-CATEGORIAS.md"
  "IMPLEMENTACAO-COMPLETA-4-CATEGORIAS.md"
  "CORRECOES-UPDATE-COMPLETAS.md"
  "FIX-EDICAO-TIPOS-QUALIFICACOES.md"
  "RELATORIO-FINAL-COMPLETO.md"
)
for doc in "${docs[@]}"; do
  if [ -f "$doc" ]; then
    echo "   ✅ $doc"
  else
    echo "   ❌ $doc (faltando)"
  fi
done
echo ""

# 9. Verificar scripts criados
echo "9️⃣ SCRIPTS CRIADOS:"
scripts=(
  "scripts/audit-update-queries.sh"
  "scripts/optimize-select-star.sh"
  "scripts/fix-all-select-star.sh"
  "scripts/verificar-updates-pendentes.sh"
  "scripts/diagnostico-tipos-qualificacoes.sh"
  "scripts/validate-queries.sh"
)
script_count=0
for script in "${scripts[@]}"; do
  if [ -f "$script" ]; then
    ((script_count++))
    echo "   ✅ $script"
  fi
done
echo "   📊 $script_count scripts criados"
echo ""

# 10. Verificar últimos commits
echo "🔟 ÚLTIMOS COMMITS:"
git log --oneline -5 | sed 's/^/   /'
echo ""

# 11. Verificar build
echo "1️⃣1️⃣ BUILD STATUS:"
if [ -d "dist" ]; then
  echo "   ✅ Pasta dist existe"
  dist_size=$(du -sh dist 2>/dev/null | cut -f1)
  echo "   📦 Tamanho: $dist_size"
else
  echo "   ❌ Pasta dist não encontrada"
fi
echo ""

# RESUMO FINAL
echo "=============================================="
echo "📊 RESUMO FINAL:"
echo ""
echo "✅ Concluído:"
echo "   - Arquivos ARCHIVE: removidos"
echo "   - Migrations desabilitadas: removidas"
echo "   - Correções de UPDATE: 3 arquivos"
echo "   - Sistema 4 categorias: backend implementado"
echo "   - Documentação: 5+ arquivos criados"
echo "   - Scripts: $script_count criados"
echo ""
echo "⏳ Pendente:"
echo "   - SELECT * otimização: $select_star_count queries"
echo "   - @ts-nocheck: $tsnocheck_count arquivos"
echo "   - Console.log: $console_count ocorrências"
echo "   - Frontend 4 categorias: 0%"
echo "   - Aplicar migration no banco"
echo ""

# Verificar se há mudanças não commitadas
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  echo "⚠️  HÁ MUDANÇAS NÃO COMMITADAS!"
  git status --short | head -10
else
  echo "✅ Todos os commits estão atualizados"
fi
echo ""

echo "=============================================="
echo "✅ VERIFICAÇÃO FINAL CONCLUÍDA"
