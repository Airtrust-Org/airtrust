#!/bin/bash
set -euo pipefail

API_URL="http://localhost:8787"
RESULTS_FILE="/tmp/test-modal-results.txt"

echo "🧪 TESTE COMPLETO - MODAL FUNCIONÁRIO" > "$RESULTS_FILE"
echo "=====================================" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success_count=0
fail_count=0

test_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    echo "✅ $1" >> "$RESULTS_FILE"
    ((success_count++))
}

test_fail() {
    echo -e "${RED}❌ $1${NC}"
    echo "❌ $1" >> "$RESULTS_FILE"
    ((fail_count++))
}

test_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
    echo "ℹ️  $1" >> "$RESULTS_FILE"
}

echo ""
echo "🔐 FASE 0: AUTENTICAÇÃO"
echo "======================="

# Login
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // empty')

if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    test_pass "Login realizado com sucesso"
    test_info "Token: ${TOKEN:0:30}..."
else
    test_fail "Falha no login - token não obtido"
    exit 1
fi

echo ""
echo "📋 FASE 1: VALIDAÇÃO DE ENDPOINTS"
echo "================================="

# Testar endpoint /api/funcoes
FUNCOES_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/funcoes")
FUNCOES_SUCCESS=$(echo "$FUNCOES_RESPONSE" | jq -r '.success // false')
FUNCOES_COUNT=$(echo "$FUNCOES_RESPONSE" | jq -r '.data | length // 0')

if [ "$FUNCOES_SUCCESS" = "true" ] && [ "$FUNCOES_COUNT" -gt 0 ]; then
    test_pass "Endpoint /api/funcoes: $FUNCOES_COUNT registros"
else
    test_fail "Endpoint /api/funcoes falhou ou retornou vazio"
fi

# Testar endpoint /api/setores
SETORES_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/setores")
SETORES_SUCCESS=$(echo "$SETORES_RESPONSE" | jq -r '.success // false')
SETORES_COUNT=$(echo "$SETORES_RESPONSE" | jq -r '.data | length // 0')

if [ "$SETORES_SUCCESS" = "true" ] && [ "$SETORES_COUNT" -gt 0 ]; then
    test_pass "Endpoint /api/setores: $SETORES_COUNT registros"
else
    test_fail "Endpoint /api/setores falhou ou retornou vazio"
fi

# Testar endpoint /api/modelos-aeronave
MODELOS_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/modelos-aeronave")
MODELOS_SUCCESS=$(echo "$MODELOS_RESPONSE" | jq -r '.success // false')
MODELOS_COUNT=$(echo "$MODELOS_RESPONSE" | jq -r '.data | length // 0')

if [ "$MODELOS_SUCCESS" = "true" ] && [ "$MODELOS_COUNT" -gt 0 ]; then
    test_pass "Endpoint /api/modelos-aeronave: $MODELOS_COUNT registros"
    # Extrair IDs e códigos dos modelos
    MODELO_1_ID=$(echo "$MODELOS_RESPONSE" | jq -r '.data[0].id // empty')
    MODELO_1_CODIGO=$(echo "$MODELOS_RESPONSE" | jq -r '.data[0].codigo // empty')
    test_info "Modelo 1: ID=$MODELO_1_ID, Código=$MODELO_1_CODIGO"
else
    test_fail "Endpoint /api/modelos-aeronave falhou ou retornou vazio"
fi

echo ""
echo "➕ FASE 4: CRIAR FUNCIONÁRIO"
echo "============================"

# Obter primeira função e setor para uso no teste
FUNCAO_NOME=$(echo "$FUNCOES_RESPONSE" | jq -r '.data[0].nome // "Comandante"')
SETOR_NOME=$(echo "$SETORES_RESPONSE" | jq -r '.data[0].nome // "Operações"')

test_info "Usando Função: $FUNCAO_NOME"
test_info "Usando Setor: $SETOR_NOME"

# Criar funcionário de teste
TIMESTAMP=$(date +%s)
CREATE_PAYLOAD=$(cat <<EOF
{
  "nome": "João Silva Teste $TIMESTAMP",
  "cpf": "12345678901",
  "matricula": "00999",
  "funcao": "$FUNCAO_NOME",
  "setor": "$SETOR_NOME",
  "modelo_aeronave_id": $MODELO_1_ID,
  "base": "GRU",
  "data_admissao": "2024-01-15",
  "status": "ATIVO",
  "ativo": 1
}
EOF
)

CREATE_RESPONSE=$(curl -s -X POST "$API_URL/api/funcionarios" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$CREATE_PAYLOAD")

CREATE_SUCCESS=$(echo "$CREATE_RESPONSE" | jq -r '.success // false')
FUNCIONARIO_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id // empty')

if [ "$CREATE_SUCCESS" = "true" ] && [ -n "$FUNCIONARIO_ID" ]; then
    test_pass "Funcionário criado com ID: $FUNCIONARIO_ID"
    
    # Validar dados salvos
    GET_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/funcionarios/$FUNCIONARIO_ID")
    GET_SUCCESS=$(echo "$GET_RESPONSE" | jq -r '.success // false')
    
    if [ "$GET_SUCCESS" = "true" ]; then
        SAVED_MATRICULA=$(echo "$GET_RESPONSE" | jq -r '.data.matricula // empty')
        SAVED_FUNCAO=$(echo "$GET_RESPONSE" | jq -r '.data.funcao // empty')
        SAVED_SETOR=$(echo "$GET_RESPONSE" | jq -r '.data.setor // empty')
        SAVED_MODELO=$(echo "$GET_RESPONSE" | jq -r '.data.modelo_aeronave_id // empty')
        SAVED_BASE=$(echo "$GET_RESPONSE" | jq -r '.data.base // empty')
        
        test_info "Matrícula salva: $SAVED_MATRICULA (esperado: 00999)"
        test_info "Função salva: $SAVED_FUNCAO (esperado: $FUNCAO_NOME)"
        test_info "Setor salvo: $SAVED_SETOR (esperado: $SETOR_NOME)"
        test_info "Modelo ID salvo: $SAVED_MODELO (esperado: $MODELO_1_ID)"
        test_info "Base salva: $SAVED_BASE (esperado: GRU)"
        
        # Validações específicas
        if [ "$SAVED_MATRICULA" = "00999" ]; then
            test_pass "Matrícula com 5 dígitos corretos"
        else
            test_fail "Matrícula incorreta: $SAVED_MATRICULA (esperado 00999)"
        fi
        
        if [ "$SAVED_FUNCAO" = "$FUNCAO_NOME" ]; then
            test_pass "Função salva como texto (não ID)"
        else
            test_fail "Função incorreta: $SAVED_FUNCAO"
        fi
        
        if [ "$SAVED_SETOR" = "$SETOR_NOME" ]; then
            test_pass "Setor salvo como texto (não ID)"
        else
            test_fail "Setor incorreto: $SAVED_SETOR"
        fi
        
        if [ "$SAVED_MODELO" = "$MODELO_1_ID" ]; then
            test_pass "Modelo salvo como ID numérico"
        else
            test_fail "Modelo incorreto: $SAVED_MODELO (esperado $MODELO_1_ID)"
        fi
        
        if [ "$SAVED_BASE" = "GRU" ]; then
            test_pass "Base em UPPERCASE"
        else
            test_fail "Base incorreta: $SAVED_BASE (esperado GRU)"
        fi
    else
        test_fail "Erro ao buscar funcionário criado"
    fi
else
    test_fail "Erro ao criar funcionário"
    test_info "Response: $CREATE_RESPONSE"
fi

echo ""
echo "✏️  FASE 5: EDITAR FUNCIONÁRIO"
echo "=============================="

if [ -n "$FUNCIONARIO_ID" ]; then
    # Editar funcionário
    UPDATE_PAYLOAD=$(cat <<EOF
{
  "nome": "João Silva Teste EDITADO",
  "cpf": "12345678901",
  "matricula": "00888",
  "funcao": "$FUNCAO_NOME",
  "setor": "$SETOR_NOME",
  "modelo_aeronave_id": $MODELO_1_ID,
  "base": "cgb",
  "data_admissao": "2024-01-15",
  "status": "ATIVO"
}
EOF
)

    UPDATE_RESPONSE=$(curl -s -X PUT "$API_URL/api/funcionarios/$FUNCIONARIO_ID" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "$UPDATE_PAYLOAD")
    
    UPDATE_SUCCESS=$(echo "$UPDATE_RESPONSE" | jq -r '.success // false')
    
    if [ "$UPDATE_SUCCESS" = "true" ]; then
        test_pass "Funcionário atualizado com sucesso"
        
        # Validar alterações
        GET_UPDATED=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/api/funcionarios/$FUNCIONARIO_ID")
        UPDATED_MATRICULA=$(echo "$GET_UPDATED" | jq -r '.data.matricula // empty')
        UPDATED_BASE=$(echo "$GET_UPDATED" | jq -r '.data.base // empty')
        UPDATED_NOME=$(echo "$GET_UPDATED" | jq -r '.data.nome // empty')
        
        test_info "Nome atualizado: $UPDATED_NOME"
        test_info "Matrícula atualizada: $UPDATED_MATRICULA (esperado: 00888)"
        test_info "Base atualizada: $UPDATED_BASE (esperado: CGB - uppercase)"
        
        if [ "$UPDATED_MATRICULA" = "00888" ]; then
            test_pass "Matrícula editada corretamente"
        else
            test_fail "Matrícula não atualizada: $UPDATED_MATRICULA"
        fi
        
        if [ "$UPDATED_BASE" = "CGB" ]; then
            test_pass "Base convertida para UPPERCASE na edição"
        else
            test_fail "Base não convertida: $UPDATED_BASE (esperado CGB)"
        fi
    else
        test_fail "Erro ao atualizar funcionário"
    fi
fi

echo ""
echo "🧹 LIMPEZA: Deletar funcionário de teste"
echo "========================================="

if [ -n "$FUNCIONARIO_ID" ]; then
    DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/api/funcionarios/$FUNCIONARIO_ID" \
      -H "Authorization: Bearer $TOKEN")
    
    DELETE_SUCCESS=$(echo "$DELETE_RESPONSE" | jq -r '.success // false')
    
    if [ "$DELETE_SUCCESS" = "true" ]; then
        test_pass "Funcionário de teste deletado (soft delete)"
    else
        test_fail "Erro ao deletar funcionário de teste"
    fi
fi

echo ""
echo "📊 RESUMO FINAL"
echo "==============="
echo -e "${GREEN}Sucessos: $success_count${NC}"
echo -e "${RED}Falhas: $fail_count${NC}"
echo ""
echo "Sucessos: $success_count" >> "$RESULTS_FILE"
echo "Falhas: $fail_count" >> "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"
echo "Relatório completo salvo em: $RESULTS_FILE"

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM!${NC}"
    echo "🎉 TODOS OS TESTES PASSARAM!" >> "$RESULTS_FILE"
    exit 0
else
    echo -e "${RED}⚠️  $fail_count TESTE(S) FALHARAM${NC}"
    echo "⚠️  $fail_count TESTE(S) FALHARAM" >> "$RESULTS_FILE"
    exit 1
fi
