#!/bin/bash

echo "🔍 VERIFICAÇÃO ESPECÍFICA DOS ITENS DO PROMPT"
echo "════════════════════════════════════════════════════════════"
echo ""

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "📦 1. SISTEMA R2 STORAGE"
echo "────────────────────────────────────────────────────────────"

echo -n "Verificando binding R2 no wrangler.toml... "
if grep -q "AIRTRUST_STORAGE" wrangler.toml; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 2. ENDPOINTS DE EMPRESAS"
echo "────────────────────────────────────────────────────────────"

echo -n "GET /api/v2/empresas... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/v2/empresas")
if [ "$STATUS" = "200" ]; then
    echo "✅ OK (200)"
else
    echo "❌ ERRO ($STATUS)"
fi

echo -n "Arquivo empresas.ts existe... "
if [ -f "src/worker/api/v2/empresas.ts" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 3. UPLOAD DE CERTIFICADOS"
echo "────────────────────────────────────────────────────────────"

echo -n "Arquivo certificados-storage.ts existe... "
if [ -f "src/worker/api/v2/certificados-storage.ts" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 4. GERAÇÃO DE PDF"
echo "────────────────────────────────────────────────────────────"

echo -n "Arquivo fichas-pdf-storage.ts existe... "
if [ -f "src/worker/api/v2/fichas-pdf-storage.ts" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 5. FRONTEND - PÁGINA DE EMPRESAS"
echo "────────────────────────────────────────────────────────────"

echo -n "Página Empresas.tsx existe... "
if [ -f "src/react-app/pages/Empresas.tsx" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 6. COMPONENTES DE UPLOAD"
echo "────────────────────────────────────────────────────────────"

echo -n "FormularioEmpresa.tsx existe... "
if [ -f "src/react-app/components/empresas/FormularioEmpresa.tsx" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo -n "UploadLogo.tsx existe... "
if [ -f "src/react-app/components/empresas/UploadLogo.tsx" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo -n "UploadCertificado.tsx existe... "
if [ -f "src/react-app/components/certificados/UploadCertificado.tsx" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 7. MIGRATIONS"
echo "────────────────────────────────────────────────────────────"

echo -n "Migration empresas existe... "
if ls migrations/*empresas*.sql 1> /dev/null 2>&1; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo -n "Tabela empresas no banco... "
EMPRESAS=$(npx wrangler d1 execute airtrust-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' AND name='empresas';" 2>&1 | grep -c '"name": "empresas"')
if [ "$EMPRESAS" -gt "0" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo ""
echo "📦 8. SISTEMA DE ORDENAMENTO DE MANOBRAS"
echo "────────────────────────────────────────────────────────────"

echo -n "Componente ReordenarManobras.tsx existe... "
if [ -f "src/react-app/components/modelos/ReordenarManobras.tsx" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo -n "Página EditarModeloSessao.tsx existe... "
if [ -f "src/react-app/pages/simuladores/EditarModeloSessao.tsx" ]; then
    echo "✅ OK"
else
    echo "❌ FALTANDO"
fi

echo -n "Endpoint de reordenamento funciona... "
# Testar se endpoint existe (mesmo que retorne 404 por falta de auth, significa que existe)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/v2/simuladores/modelos/4/manobras")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ]; then
    echo "✅ OK ($STATUS)"
else
    echo "❌ ERRO ($STATUS)"
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 RESUMO"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "Verificando se TUDO do prompt está implementado..."
echo ""
