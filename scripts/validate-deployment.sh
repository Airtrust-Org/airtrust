#!/bin/bash

echo "🔍 VALIDAÇÃO PRÉ-DEPLOY - AirTrust v2"
echo "======================================"
echo ""

ERRORS=0

# 1. Verificar URLs hardcoded
echo "1️⃣ Verificando URLs hardcoded..."
HARDCODED=$(grep -r "localhost:8787" src --include="*.tsx" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "@ts-nocheck" | grep -v "allowedOrigins" | grep -v "// " | wc -l | tr -d ' ')

if [ "$HARDCODED" -gt "0" ]; then
    echo "   ❌ Encontradas $HARDCODED URLs hardcoded!"
    echo "   📝 Arquivos com problema:"
    grep -r "localhost:8787" src --include="*.tsx" --include="*.ts" --include="*.js" 2>/dev/null | grep -v "@ts-nocheck" | grep -v "allowedOrigins" | grep -v "// " | head -10
    ERRORS=$((ERRORS + 1))
else
    echo "   ✅ Nenhuma URL hardcoded encontrada"
fi
echo ""

# 2. Verificar wrangler.json
echo "2️⃣ Verificando wrangler.json..."
if grep -q '"assets"' wrangler.json; then
    echo "   ✅ Assets configurados"
else
    echo "   ❌ Assets NÃO configurados!"
    ERRORS=$((ERRORS + 1))
fi

if grep -q '"binding": "ASSETS"' wrangler.json; then
    echo "   ✅ Binding ASSETS presente"
else
    echo "   ❌ Binding ASSETS ausente!"
    ERRORS=$((ERRORS + 1))
fi

if grep -q '"d1_databases"' wrangler.json; then
    echo "   ✅ D1 Database configurado"
else
    echo "   ❌ D1 Database NÃO configurado!"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Verificar build
echo "3️⃣ Verificando build..."
if [ -d "dist/client" ]; then
    FILES=$(find dist/client -type f | wc -l | tr -d ' ')
    echo "   ✅ Build existe ($FILES arquivos)"
else
    echo "   ❌ Build NÃO existe! Execute: npm run build"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. Verificar rotas conflitantes no worker
echo "4️⃣ Verificando rotas conflitantes..."
if grep -q "worker.get('/', (c) => {" src/worker/index.ts; then
    echo "   ❌ Rota raiz conflitante encontrada em worker/index.ts!"
    ERRORS=$((ERRORS + 1))
else
    echo "   ✅ Sem rotas conflitantes"
fi
echo ""

# 5. Verificar SPA fallback
echo "5️⃣ Verificando SPA fallback..."
if grep -q "app.notFound(async (c)" src/worker/routes/index.ts; then
    echo "   ✅ SPA fallback implementado"
else
    echo "   ❌ SPA fallback NÃO implementado!"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 6. Verificar index.html
echo "6️⃣ Verificando index.html..."
if [ -f "dist/client/index.html" ]; then
    echo "   ✅ index.html existe"
else
    echo "   ❌ index.html NÃO existe!"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# Resultado final
echo "======================================"
if [ $ERRORS -eq 0 ]; then
    echo "✅ VALIDAÇÃO PASSOU - Pronto para deploy!"
    exit 0
else
    echo "❌ VALIDAÇÃO FALHOU - $ERRORS erro(s) encontrado(s)"
    echo ""
    echo "🔧 Corrija os erros antes de fazer deploy!"
    exit 1
fi
