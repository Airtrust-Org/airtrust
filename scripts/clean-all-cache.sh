#!/bin/bash
# ===== SCRIPT DE LIMPEZA TOTAL - AIRTRUST =====
# Resolve problemas de cache impedindo mudanças de refletir
# Uso: ./scripts/clean-all-cache.sh

set -e  # Parar em caso de erro

echo "🧹 =========================================="
echo "🧹  LIMPEZA TOTAL DE CACHE - AIRTRUST"
echo "🧹 =========================================="
echo ""

# 1. Matar processos node/vite/npm
echo "⚠️  Passo 1/6: Parando processos Node/Vite..."
pkill -f "vite" 2>/dev/null || true
pkill -f "npm" 2>/dev/null || true
pkill -f "node" 2>/dev/null || true
echo "✅ Processos parados"
echo ""

# 2. Limpar caches npm
echo "⚠️  Passo 2/6: Limpando cache do npm..."
npm cache clean --force
npm cache verify
echo "✅ Cache npm limpo"
echo ""

# 3. Deletar pastas de build e dependências
echo "⚠️  Passo 3/6: Removendo node_modules, dist, caches..."
rm -rf node_modules
rm -rf dist
rm -rf .vite
rm -rf .cache
rm -rf build
rm -rf package-lock.json
echo "✅ Pastas removidas"
echo ""

# 4. Reinstalar dependências do zero
echo "⚠️  Passo 4/6: Reinstalando dependências (pode levar 1-2 min)..."
npm install --prefer-offline=false --no-audit
echo "✅ Dependências instaladas"
echo ""

# 5. Build limpo
echo "⚠️  Passo 5/6: Executando build de produção..."
npm run build
echo "✅ Build concluído"
echo ""

# 6. Verificar hash dos arquivos gerados
echo "⚠️  Passo 6/6: Verificando hashes gerados..."
echo ""
echo "📦 Arquivos Simuladores gerados:"
ls -lh dist/client/assets/ | grep "Simuladores" || echo "⚠️  Nenhum arquivo Simuladores encontrado"
echo ""
echo "📦 Total de assets:"
ls -lh dist/client/assets/ | wc -l
echo ""

echo "🎉 =========================================="
echo "🎉  LIMPEZA CONCLUÍDA COM SUCESSO!"
echo "🎉 =========================================="
echo ""
echo "📋 Próximos passos:"
echo "   1. Para testar localhost: npm run dev"
echo "   2. Para preview local: npm run preview"
echo "   3. Para deploy: git add . && git commit -m 'fix: cache' && git push"
echo ""
