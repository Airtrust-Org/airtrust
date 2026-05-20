#!/bin/bash
# ============================================================
# Script: Migração de nomenclatura antiga de certificados
# Data: 29/11/2025
# Descrição: Renomeia certificados antigos para padrão atual
#           CERT-{CPF}-{CODIGO}-{DATA}-{UUID}.pdf
# ============================================================

set -euo pipefail

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configurações
DB_NAME="airtrust-db"
BUCKET_NAME="airtrust-storage"
DRY_RUN="${1:-false}" # Passar "true" para simular sem alterar

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}🔄 MIGRAÇÃO DE NOMENCLATURA DE CERTIFICADOS${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}⚠️  MODO DRY-RUN: Nenhuma alteração será feita${NC}"
else
  echo -e "${RED}⚠️  MODO PRODUÇÃO: Arquivos serão renomeados!${NC}"
  read -p "Continuar? (yes/no): " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Operação cancelada."
    exit 0
  fi
fi

echo ""

# 1. Buscar certificados com nomenclatura antiga
echo -e "${BLUE}📋 Buscando certificados com nomenclatura antiga...${NC}"

QUERY="
SELECT 
  d.id,
  d.uuid,
  d.r2_key,
  d.nome_arquivo,
  f.cpf,
  qh.qualificacao_codigo,
  qh.data_conclusao
FROM documentos d
INNER JOIN funcionarios f ON d.funcionario_id = f.id
LEFT JOIN qualificacoes_historico qh ON d.uuid = qh.certificado_arquivo_id
WHERE d.tipo = 'application/pdf'
  AND d.r2_key LIKE 'certificados/%'
  AND d.nome_arquivo NOT LIKE 'CERT-%'
  AND d.deleted_at IS NULL
ORDER BY d.created_at ASC
"

# Executar query e salvar resultado
RESULT=$(wrangler d1 execute "$DB_NAME" --command="$QUERY" --json 2>/dev/null || echo "[]")

# Contar certificados
COUNT=$(echo "$RESULT" | jq '. | length' 2>/dev/null || echo "0")

if [[ "$COUNT" -eq 0 ]]; then
  echo -e "${GREEN}✅ Nenhum certificado com nomenclatura antiga encontrado!${NC}"
  exit 0
fi

echo -e "${YELLOW}⚠️  Encontrados $COUNT certificados para migrar${NC}"
echo ""

# 2. Processar cada certificado
MIGRATED=0
FAILED=0

echo "$RESULT" | jq -c '.[]' | while read -r row; do
  DOC_ID=$(echo "$row" | jq -r '.id')
  UUID=$(echo "$row" | jq -r '.uuid')
  OLD_R2_KEY=$(echo "$row" | jq -r '.r2_key')
  OLD_NAME=$(echo "$row" | jq -r '.nome_arquivo')
  CPF=$(echo "$row" | jq -r '.cpf' | tr -d '.-')
  CODIGO=$(echo "$row" | jq -r '.qualificacao_codigo // "GERAL"')
  DATA_CONCLUSAO=$(echo "$row" | jq -r '.data_conclusao // empty')

  # Validar CPF
  if [[ -z "$CPF" ]] || [[ "$CPF" == "null" ]]; then
    echo -e "${RED}❌ [ID=$DOC_ID] CPF inválido, pulando...${NC}"
    ((FAILED++))
    continue
  fi

  # Validar data
  if [[ -z "$DATA_CONCLUSAO" ]] || [[ "$DATA_CONCLUSAO" == "null" ]]; then
    DATA_CONCLUSAO=$(date +%Y-%m-%d)
    echo -e "${YELLOW}⚠️  [ID=$DOC_ID] Sem data de conclusão, usando hoje: $DATA_CONCLUSAO${NC}"
  fi

  # Formatar data: YYYYMMDD
  DATA_FORMATADA=$(echo "$DATA_CONCLUSAO" | tr -d '-')

  # Gerar novo nome
  NEW_NAME="CERT-${CPF}-${CODIGO}-${DATA_FORMATADA}-${UUID:0:8}.pdf"
  NEW_R2_KEY="certificados/${NEW_NAME}"

  echo ""
  echo -e "${BLUE}📄 Migrando certificado ID=$DOC_ID${NC}"
  echo "  Antigo: $OLD_NAME"
  echo "  Novo:   $NEW_NAME"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}  [DRY-RUN] Simulando migração...${NC}"
    ((MIGRATED++))
    continue
  fi

  # 3. Copiar arquivo no R2 (novo key)
  echo "  🔄 Copiando no R2..."
  if wrangler r2 object put "$BUCKET_NAME/$NEW_R2_KEY" \
    --file=<(wrangler r2 object get "$BUCKET_NAME/$OLD_R2_KEY" 2>/dev/null) \
    --content-type="application/pdf" 2>/dev/null; then
    
    echo -e "  ${GREEN}✅ Arquivo copiado${NC}"

    # 4. Atualizar D1
    echo "  🗄️  Atualizando database..."
    UPDATE_QUERY="
    UPDATE documentos 
    SET r2_key = '$NEW_R2_KEY',
        nome_arquivo = '$NEW_NAME',
        updated_at = datetime('now')
    WHERE id = $DOC_ID
    "

    if wrangler d1 execute "$DB_NAME" --command="$UPDATE_QUERY" >/dev/null 2>&1; then
      echo -e "  ${GREEN}✅ Database atualizado${NC}"

      # 5. Deletar arquivo antigo do R2
      echo "  🗑️  Removendo arquivo antigo..."
      if wrangler r2 object delete "$BUCKET_NAME/$OLD_R2_KEY" 2>/dev/null; then
        echo -e "  ${GREEN}✅ Arquivo antigo removido${NC}"
        ((MIGRATED++))
      else
        echo -e "  ${YELLOW}⚠️  Aviso: Não foi possível remover arquivo antigo${NC}"
        ((MIGRATED++))
      fi
    else
      echo -e "  ${RED}❌ Erro ao atualizar database${NC}"
      ((FAILED++))
    fi
  else
    echo -e "  ${RED}❌ Erro ao copiar arquivo no R2${NC}"
    ((FAILED++))
  fi
done

# Resumo final
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}📊 RESUMO DA MIGRAÇÃO${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ Migrados com sucesso: $MIGRATED${NC}"
echo -e "${RED}❌ Falhas: $FAILED${NC}"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo -e "${YELLOW}ℹ️  Execute sem 'true' para aplicar as alterações:${NC}"
  echo -e "${YELLOW}   ./scripts/migrate-certificados-nomenclatura.sh${NC}"
else
  echo -e "${GREEN}✅ Migração concluída!${NC}"
fi
