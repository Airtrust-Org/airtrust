#!/bin/bash
# scripts/diagnose-d1-issue.sh
# Diagnóstico completo de problemas com D1

echo "🩺 Diagnóstico Completo D1"
echo "=========================="
echo ""

cd worker-airtrust

# 1. Listar databases físicos
echo "📁 Arquivos SQLite encontrados:"
find .wrangler/state -name "*.sqlite" 2>/dev/null | while read -r file; do
  size=$(ls -lh "$file" | awk '{print $5}')
  modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null | cut -d'.' -f1)
  echo "  - $(basename $file) ($size, modificado: $modified)"
done

echo ""

# 2. Verificar database ativo
echo "🔍 Database ativo (via wrangler d1):"
npx wrangler d1 execute DB --local --command="SELECT 'ATIVO' as status, datetime('now') as timestamp" 2>&1 | grep -A 5 "results"

echo ""

# 3. Testar contagens críticas
echo "📊 Contagens críticas:"
echo -n "  modelos_sessao: "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM modelos_sessao WHERE deleted_at IS NULL" 2>&1 | grep -o '[0-9]*' | tail -1

echo -n "  cadastro_manobras: "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM cadastro_manobras WHERE deleted_at IS NULL" 2>&1 | grep -o '[0-9]*' | tail -1

echo -n "  template_manobras (total): "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM template_manobras" 2>&1 | grep -o '[0-9]*' | tail -1

echo -n "  template_manobras (sessão 4): "
npx wrangler d1 execute DB --local --command="SELECT COUNT(*) FROM template_manobras WHERE template_id = 4" 2>&1 | grep -o '[0-9]*' | tail -1

echo ""

# 4. Verificar se worker está rodando
echo "🔌 Status do Worker:"
if curl -s http://localhost:8787/api/simuladores/modelos >/dev/null 2>&1; then
  echo "  ✅ Worker rodando em http://localhost:8787"
  
  # Testar endpoint específico
  echo ""
  echo "🌐 Teste API (GET /modelos/4/manobras):"
  RESPONSE=$(curl -s http://localhost:8787/api/simuladores/modelos/4/manobras)
  COUNT=$(echo "$RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")
  echo "  Quantidade retornada: $COUNT manobras"
  
  if [ "$COUNT" != "22" ]; then
    echo "  ❌ PROBLEMA: Deveria retornar 22 manobras!"
  else
    echo "  ✅ OK: 22 manobras retornadas"
  fi
else
  echo "  ❌ Worker NÃO está rodando"
  echo "  💡 Execute: npm run dev:all"
fi

echo ""

# 5. Verificar schema das tabelas críticas
echo "🔧 Schema das tabelas:"
for table in modelos_sessao cadastro_manobras template_manobras manobras_categorias; do
  echo ""
  echo "  Tabela: $table"
  npx wrangler d1 execute DB --local --command="PRAGMA table_info($table)" 2>&1 | grep -E "name|type" | head -20
done

echo ""
echo "================================"
echo "✅ Diagnóstico completo"
echo ""
echo "💡 Se houver problemas:"
echo "   1. npm run db:reset:local    # Reseta database local"
echo "   2. npm run db:seed:production # Popula com dados"
echo "   3. npm run dev:all           # Reinicia worker"
