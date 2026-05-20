#!/bin/bash

echo "🔍 DIAGNÓSTICO: EDIÇÃO DE TIPOS DE QUALIFICAÇÃO"
echo "================================================"
echo ""

# 1. Verificar endpoint PUT
echo "1️⃣ VERIFICANDO ENDPOINT PUT /api/v2/tipos-qualificacoes/:id"
echo ""

grep -n "app.put.*:id" src/worker/api/tipos-qualificacoes.ts | head -5
echo ""

# 2. Verificar campos sendo atualizados no backend
echo "2️⃣ CAMPOS SENDO ATUALIZADOS NO BACKEND:"
echo ""
echo "   Linha 266-440: Endpoint PUT"
grep -A 20 "app.put.*:id" src/worker/api/tipos-qualificacoes.ts | grep -E "(UPDATE|SET|nome|descricao|validade_meses|vencimento_tipo|status|ativo)" | head -15
echo ""

# 3. Verificar campos sendo enviados pelo frontend
echo "3️⃣ CAMPOS ENVIADOS PELO FRONTEND:"
echo ""
echo "   handleSalvarTipo (linha 215):"
grep -A 5 "body: JSON.stringify(formTipo)" src/react-app/pages/Qualificacoes.tsx
echo ""

# 4. Verificar estrutura do formTipo
echo "4️⃣ ESTRUTURA DO FORMULÁRIO (formTipo):"
echo ""
grep -A 10 "const \[formTipo, setFormTipo\]" src/react-app/pages/Qualificacoes.tsx
echo ""

# 5. Verificar campos do formulário HTML
echo "5️⃣ CAMPOS DO FORMULÁRIO HTML:"
echo ""
echo "   ✅ Nome:"
grep -n "formTipo.nome" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""
echo "   ✅ Código:"
grep -n "formTipo.codigo" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""
echo "   ✅ Tipo:"
grep -n "formTipo.tipo" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""
echo "   ✅ Descrição:"
grep -n "formTipo.descricao" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""
echo "   ✅ Validade (meses):"
grep -n "formTipo.validade_meses" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""
echo "   ✅ Vencimento Tipo:"
grep -n "formTipo.vencimento_tipo" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""
echo "   ✅ Status:"
grep -n "formTipo.status" src/react-app/pages/Qualificacoes.tsx | head -2
echo ""

# 6. Verificar tabelas no banco
echo "6️⃣ TABELAS ENVOLVIDAS:"
echo ""
echo "   📊 catalogo_treinamentos (tabela principal)"
echo "   📊 tipos_qualificacoes (tabela de sincronização)"
echo ""

# 7. Verificar lógica de atualização
echo "7️⃣ LÓGICA DE ATUALIZAÇÃO NO BACKEND:"
echo ""
echo "   O endpoint PUT faz:"
echo "   1. Busca o tipo em catalogo_treinamentos"
echo "   2. Busca em tipos_qualificacoes (se existir)"
echo "   3. Atualiza tipos_qualificacoes primeiro"
echo "   4. Atualiza catalogo_treinamentos depois"
echo "   5. Recalcula qualificações vinculadas"
echo ""

# 8. Possíveis problemas
echo "8️⃣ POSSÍVEIS PROBLEMAS:"
echo ""
echo "   ⚠️  Campo 'tipo' e 'codigo' são readonly no formulário?"
grep -B 2 -A 2 "disabled.*tipo\|readonly.*tipo" src/react-app/pages/Qualificacoes.tsx | head -10
echo ""
echo "   ⚠️  Campos não estão sendo enviados no JSON?"
echo "   ⚠️  Backend não está atualizando todos os campos?"
echo "   ⚠️  Problema de permissão no banco?"
echo ""

# 9. Verificar se há erros no console
echo "9️⃣ VERIFICAR NO NAVEGADOR:"
echo ""
echo "   1. Abrir DevTools (F12)"
echo "   2. Aba Network"
echo "   3. Editar um tipo"
echo "   4. Verificar requisição PUT /api/v2/tipos-qualificacoes/:id"
echo "   5. Ver Payload enviado"
echo "   6. Ver Response recebida"
echo ""

echo "✅ DIAGNÓSTICO CONCLUÍDO"
echo ""
echo "💡 PRÓXIMOS PASSOS:"
echo "   1. Testar edição no navegador com DevTools aberto"
echo "   2. Verificar se todos os campos estão no payload"
echo "   3. Verificar se backend retorna success: true"
echo "   4. Verificar se dados foram salvos no banco"
