#!/bin/bash

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   🔍 VERIFICAÇÃO COMPLETA - EDITAR/SALVAR (PUT/POST)    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

TOTAL_PROBLEMAS=0
TOTAL_OK=0

# Cores
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

verificar_crud() {
    local arquivo="$1"
    local nome=$(basename "$arquivo" .ts)
    local problemas=0
    
    echo -e "${BLUE}📁 Verificando: $nome${NC}"
    
    # 1. Verificar se tem POST
    if grep -q "app.post" "$arquivo"; then
        echo "  ✓ POST encontrado"
        
        # Verificar validação no POST
        if grep -A 20 "app.post" "$arquivo" | grep -q "if (!.*||.*trim\|z.object\|\.min("; then
            echo -e "  ${GREEN}✓ POST tem validações${NC}"
        else
            echo -e "  ${YELLOW}⚠️  POST pode não ter validações suficientes${NC}"
            problemas=$((problemas + 1))
        fi
    fi
    
    # 2. Verificar se tem PUT
    if grep -q "app.put" "$arquivo"; then
        echo "  ✓ PUT encontrado"
        
        # Verificar se exclui próprio ID na validação
        if grep -A 30 "app.put" "$arquivo" | grep -q "id != \?\|id <> \?"; then
            echo -e "  ${GREEN}✓ PUT exclui próprio ID na validação${NC}"
        else
            # Verificar se tem validação de duplicata
            if grep -A 30 "app.put" "$arquivo" | grep -q "SELECT.*WHERE"; then
                echo -e "  ${RED}❌ PUT tem validação MAS não exclui próprio ID${NC}"
                problemas=$((problemas + 1))
            else
                echo -e "  ${GREEN}✓ PUT sem validação de duplicata (OK se não necessário)${NC}"
            fi
        fi
        
        # Verificar número de campos no UPDATE
        update_campos=$(grep -A 50 "app.put" "$arquivo" | grep -c "updates.push\|SET.*=" | head -1)
        if [ "$update_campos" -gt 3 ]; then
            echo -e "  ${GREEN}✓ UPDATE com $update_campos campos${NC}"
        else
            echo -e "  ${YELLOW}⚠️  UPDATE com poucos campos ($update_campos)${NC}"
            problemas=$((problemas + 1))
        fi
    fi
    
    # 3. Verificar mensagens de erro
    if grep -q "catch.*error" "$arquivo"; then
        if grep -q "UNIQUE constraint\|NOT NULL\|error.message" "$arquivo"; then
            echo -e "  ${GREEN}✓ Tratamento de erros específico${NC}"
        else
            echo -e "  ${YELLOW}⚠️  Mensagens de erro genéricas${NC}"
            problemas=$((problemas + 1))
        fi
    fi
    
    echo ""
    
    if [ $problemas -gt 0 ]; then
        echo -e "  ${RED}⚠️  $problemas problemas encontrados${NC}"
        TOTAL_PROBLEMAS=$((TOTAL_PROBLEMAS + problemas))
    else
        echo -e "  ${GREEN}✅ Nenhum problema encontrado${NC}"
        TOTAL_OK=$((TOTAL_OK + 1))
    fi
    
    echo ""
    echo "─────────────────────────────────────────────────────────"
    echo ""
}

# CRUDs principais
CRUDS=(
    "src/worker/api/v2/funcionarios-crud.ts"
    "src/worker/api/v2/aeronaves.ts"
    "src/worker/api/v2/funcoes.ts"
    "src/worker/api/v2/setores.ts"
    "src/worker/api/v2/agendamentos.ts"
    "src/worker/api/v2/qualificacoes.ts"
    "src/worker/api/v2/exames-crud.ts"
    "src/worker/api/v2/checks.ts"
    "src/worker/api/v2/treinamentos.ts"
    "src/worker/api/v2/simuladores/index.ts"
)

echo "Iniciando verificação de ${#CRUDS[@]} CRUDs..."
echo ""

for crud in "${CRUDS[@]}"; do
    if [ -f "$crud" ]; then
        verificar_crud "$crud"
    else
        echo -e "${YELLOW}⚠️  Arquivo não encontrado: $crud${NC}"
        echo ""
    fi
done

# Relatório final
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              📊 RELATÓRIO DE VERIFICAÇÃO                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Arquivos verificados: ${#CRUDS[@]}"
echo "Arquivos OK: $TOTAL_OK"
echo -e "Problemas encontrados: ${RED}$TOTAL_PROBLEMAS${NC}"
echo ""

if [ $TOTAL_PROBLEMAS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  ATENÇÃO: Alguns CRUDs precisam de revisão${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Revisar arquivos com problemas"
    echo "2. Aplicar correções necessárias"
    echo "3. Testar cada CRUD manualmente"
else
    echo -e "${GREEN}✅ TODOS OS CRUDs ESTÃO OK!${NC}"
fi
