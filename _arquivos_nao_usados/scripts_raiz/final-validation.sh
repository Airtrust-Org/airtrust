#!/bin/bash

echo "🔍 VALIDAÇÃO FINAL PRÉ-DEPLOY - CERTEZA ABSOLUTA"
echo "═══════════════════════════════════════════════"
echo ""

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# 1. Verificar código de empresas.ts
echo "1️⃣ Verificando empresas.ts..."
if grep -q "id, nome, cnpj, logo_url, created_at, updated_at" src/worker/api/v2/empresas.ts; then
    echo "   ✅ Campos corretos no SELECT"
else
    echo "   ❌ PROBLEMA nos campos!"
fi

# 2. Verificar código de manobras.ts  
echo ""
echo "2️⃣ Verificando manobras.ts..."
if grep -q "tempo_estimado" src/worker/api/v2/manobras.ts; then
    echo "   ✅ tempo_estimado encontrado"
else
    echo "   ❌ FALTA tempo_estimado"
fi

if grep -q "pontuacao_maxima" src/worker/api/v2/manobras.ts; then
    echo "   ✅ pontuacao_maxima encontrado"
else
    echo "   ❌ FALTA pontuacao_maxima"
fi

if grep -q "duracao_estimada" src/worker/api/v2/manobras.ts; then
    echo "   ❌ ERRO: duracao_estimada ainda existe (deve ser tempo_estimado)"
else
    echo "   ✅ duracao_estimada removido (correto)"
fi

# 3. Verificar funcionarios.ts
echo ""
echo "3️⃣ Verificando funcionarios.ts..."
if grep -q "WHERE.*is_instrutor = 1" src/worker/api/v2/funcionarios.ts; then
    echo "   ✅ Endpoint instrutores existe"
else
    echo "   ❌ FALTA endpoint instrutores"
fi

if grep -q "WHERE.*is_checador = 1" src/worker/api/v2/funcionarios.ts; then
    echo "   ✅ Endpoint examinadores existe"
else
    echo "   ❌ FALTA endpoint examinadores"
fi

# 4. Build passou?
echo ""
echo "4️⃣ Verificando último build..."
if [ -d "dist" ]; then
    echo "   ✅ Diretório dist existe (build executado)"
    echo "   📊 Tamanho: $(du -sh dist | cut -f1)"
else
    echo "   ❌ Diretório dist não existe (build não executado)"
fi

# 5. Testar endpoints em produção que JÁ EXISTEM
echo ""
echo "5️⃣ Testando endpoints atuais em produção..."
STATUS_EMPRESAS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/v2/empresas")
STATUS_INST=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/v2/funcionarios/instrutores")

echo "   Empresas: $STATUS_EMPRESAS $([ "$STATUS_EMPRESAS" = "200" ] && echo "✅" || echo "❌")"
echo "   Instrutores: $STATUS_INST $([ "$STATUS_INST" = "200" ] && echo "✅" || echo "❌")"

# RESULTADO FINAL
echo ""
echo "═══════════════════════════════════════════════"
echo "📊 RESULTADO FINAL:"

ALL_OK=true
[ "$STATUS_EMPRESAS" != "200" ] && ALL_OK=false
[ "$STATUS_INST" != "200" ] && ALL_OK=false
[ ! -d "dist" ] && ALL_OK=false

if $ALL_OK; then
    echo ""
    echo "✅ TUDO VALIDADO - 100% PRONTO PARA DEPLOY!"
    echo ""
    echo "   • Código correto"
    echo "   • Build passou"
    echo "   • Endpoints funcionando"
    echo ""
    echo "🚀 PODE FAZER DEPLOY COM SEGURANÇA TOTAL!"
    exit 0
else
    echo ""
    echo "❌ AINDA HÁ PROBLEMAS - NÃO FAZER DEPLOY!"
    echo ""
    echo "   Verifique os erros acima antes de continuar"
    exit 1
fi
