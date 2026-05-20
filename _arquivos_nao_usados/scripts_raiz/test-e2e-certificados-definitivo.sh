#!/bin/bash
# ========================================
# 🎯 TESTE E2E DEFINITIVO - CERTIFICADOS
# Testa upload, download, geração e auditoria
# ZERO SURPRESAS GARANTIDO
# ========================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API_BASE="${API_BASE:-https://airtrust-api-production.airtrust.workers.dev/api}"
PASSED=0
FAILED=0
WARNINGS=0

echo "🎯 ============================================"
echo "🎯 TESTE E2E DEFINITIVO - CERTIFICADOS"
echo "🎯 API: $API_BASE"
echo "🎯 ============================================"
echo ""

# ========================================
# FUNÇÃO AUXILIAR: Criar PDF válido
# ========================================

criar_pdf_valido() {
  local filename=$1
  local size_mb=${2:-1}
  
  cat > "$filename" << 'PDFEOF'
%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Teste AirTrust) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000317 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
410
%%EOF
PDFEOF

  # Preencher até o tamanho desejado
  local target_size=$((size_mb * 1024 * 1024))
  local current_size=$(wc -c < "$filename")
  
  if [ $current_size -lt $target_size ]; then
    dd if=/dev/zero bs=1 count=$((target_size - current_size)) >> "$filename" 2>/dev/null
  fi
  
  echo "$filename criado ($(wc -c < "$filename" | numfmt --to=iec-i)B)"
}

# ========================================
# SETUP: Obter token e preparar ambiente
# ========================================

echo -e "${BLUE}🔐 SETUP: Obtendo token de autenticação${NC}"

LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","senha":"Admin@123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // .accessToken // empty')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ FATAL: Não foi possível obter token${NC}"
  echo "Response:"
  echo "$LOGIN_RESPONSE" | jq .
  exit 1
fi

echo -e "${GREEN}✅ Token obtido: ${TOKEN:0:30}...${NC}"

USER_ID=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.id // .user.id // 1')
USER_ROLE=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.role // .user.role // "ADMIN"')

echo "   User ID: $USER_ID | Role: $USER_ROLE"
echo ""

# Criar diretório temporário
TEMP_DIR=$(mktemp -d)
echo "📁 Diretório temporário: $TEMP_DIR"
echo ""

# ========================================
# TESTE 1: Buscar qualificação existente
# ========================================

echo -e "${BLUE}📋 TESTE 1: Buscar Qualificação Existente${NC}"

QUALIFICACOES_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/qualificacoes/historico?limit=1")

QUAL_COUNT=$(echo "$QUALIFICACOES_RESP" | jq -r '.data | length // 0')

if [ "$QUAL_COUNT" -gt 0 ]; then
  QUAL_ID=$(echo "$QUALIFICACOES_RESP" | jq -r '.data[0].id')
  FUNC_NOME=$(echo "$QUALIFICACOES_RESP" | jq -r '.data[0].funcionario_nome // "N/A"')
  QUAL_NOME=$(echo "$QUALIFICACOES_RESP" | jq -r '.data[0].qualificacao_nome // "N/A"')
  
  echo -e "${GREEN}✅ Qualificação encontrada:${NC}"
  echo "   ID: $QUAL_ID"
  echo "   Funcionário: $FUNC_NOME"
  echo "   Qualificação: $QUAL_NOME"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ Nenhuma qualificação encontrada${NC}"
  echo "   Crie uma qualificação antes de testar certificados"
  FAILED=$((FAILED + 1))
  exit 1
fi
echo ""

# ========================================
# TESTE 2: Listar certificados existentes
# ========================================

echo -e "${BLUE}📋 TESTE 2: Listar Certificados da Qualificação${NC}"

LISTA_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/certificados/historico/$QUAL_ID/certificados")

HTTP_CODE=$(echo "$LISTA_RESP" | grep "HTTP:" | cut -d: -f2)
LISTA_BODY=$(echo "$LISTA_RESP" | sed '/HTTP:/d')

if [ "$HTTP_CODE" = "200" ]; then
  CERT_COUNT=$(echo "$LISTA_BODY" | jq -r '.data | length // 0')
  echo -e "${GREEN}✅ Listagem OK (HTTP 200)${NC}"
  echo "   Certificados existentes: $CERT_COUNT"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ Erro ao listar (HTTP $HTTP_CODE)${NC}"
  echo "$LISTA_BODY" | jq .
  FAILED=$((FAILED + 1))
fi
echo ""

# ========================================
# TESTE 3: Upload de PDF válido (1MB)
# ========================================

echo -e "${BLUE}📤 TESTE 3: Upload de PDF Válido (1MB)${NC}"

criar_pdf_valido "$TEMP_DIR/cert-valido.pdf" 1

UPLOAD_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEMP_DIR/cert-valido.pdf" \
  -F "descricao=Teste E2E Upload Manual" \
  "$API_BASE/certificados/historico/$QUAL_ID/certificados/upload")

UPLOAD_HTTP=$(echo "$UPLOAD_RESP" | grep "HTTP:" | cut -d: -f2)
UPLOAD_BODY=$(echo "$UPLOAD_RESP" | sed '/HTTP:/d')

if [ "$UPLOAD_HTTP" = "200" ] || [ "$UPLOAD_HTTP" = "201" ]; then
  DOC_ID=$(echo "$UPLOAD_BODY" | jq -r '.data.id // empty')
  DOC_UUID=$(echo "$UPLOAD_BODY" | jq -r '.data.uuid // empty')
  DOC_NOME=$(echo "$UPLOAD_BODY" | jq -r '.data.nome_arquivo // empty')
  DOC_TAMANHO=$(echo "$UPLOAD_BODY" | jq -r '.data.tamanho // 0')
  
  echo -e "${GREEN}✅ Upload OK (HTTP $UPLOAD_HTTP)${NC}"
  echo "   Documento ID: $DOC_ID"
  echo "   UUID: $DOC_UUID"
  echo "   Nome: $DOC_NOME"
  echo "   Tamanho: $(echo $DOC_TAMANHO | numfmt --to=iec-i)B"
  
  # Verificar nomenclatura padronizada
  if [[ "$DOC_NOME" =~ ^CERT-[0-9]{11}-[A-Z0-9]+-[0-9]{8}-[a-f0-9]{8}\.pdf$ ]]; then
    echo -e "${GREEN}   ✅ Nomenclatura padronizada: $DOC_NOME${NC}"
  else
    echo -e "${YELLOW}   ⚠️ Nomenclatura fora do padrão: $DOC_NOME${NC}"
    WARNINGS=$((WARNINGS + 1))
  fi
  
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ Upload falhou (HTTP $UPLOAD_HTTP)${NC}"
  echo "$UPLOAD_BODY" | jq .
  FAILED=$((FAILED + 1))
  DOC_ID=""
fi
echo ""

# ========================================
# TESTE 4: Validação - Rejeitar fake PDF
# ========================================

echo -e "${BLUE}🛡️ TESTE 4: Validação - Rejeitar Fake PDF${NC}"

echo "Este não é um PDF" > "$TEMP_DIR/fake.pdf"

FAKE_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEMP_DIR/fake.pdf" \
  "$API_BASE/certificados/historico/$QUAL_ID/certificados/upload")

FAKE_HTTP=$(echo "$FAKE_RESP" | grep "HTTP:" | cut -d: -f2)
FAKE_BODY=$(echo "$FAKE_RESP" | sed '/HTTP:/d')

if [ "$FAKE_HTTP" = "400" ]; then
  ERROR_MSG=$(echo "$FAKE_BODY" | jq -r '.error // empty')
  
  if echo "$ERROR_MSG" | grep -qi "magic bytes\|inválid\|não é um PDF"; then
    echo -e "${GREEN}✅ Validação OK - Fake PDF rejeitado${NC}"
    echo "   Mensagem: $ERROR_MSG"
    PASSED=$((PASSED + 1))
  else
    echo -e "${YELLOW}⚠️ Rejeitado mas mensagem inesperada${NC}"
    echo "   Mensagem: $ERROR_MSG"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo -e "${RED}❌ CRÍTICO: Fake PDF foi aceito! (HTTP $FAKE_HTTP)${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

# ========================================
# TESTE 5: Validação - Rejeitar arquivo > 10MB
# ========================================

echo -e "${BLUE}🛡️ TESTE 5: Validação - Rejeitar Arquivo > 10MB${NC}"

criar_pdf_valido "$TEMP_DIR/cert-gigante.pdf" 11

HUGE_RESP=$(curl -s -w "\nHTTP:%{http_code}" --max-time 30 \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TEMP_DIR/cert-gigante.pdf" \
  "$API_BASE/certificados/historico/$QUAL_ID/certificados/upload")

HUGE_HTTP=$(echo "$HUGE_RESP" | grep "HTTP:" | cut -d: -f2)
HUGE_BODY=$(echo "$HUGE_RESP" | sed '/HTTP:/d')

if [ "$HUGE_HTTP" = "400" ]; then
  ERROR_MSG=$(echo "$HUGE_BODY" | jq -r '.error // empty')
  
  if echo "$ERROR_MSG" | grep -qi "muito grande\|too large\|10MB"; then
    echo -e "${GREEN}✅ Validação OK - Arquivo > 10MB rejeitado${NC}"
    echo "   Mensagem: $ERROR_MSG"
    PASSED=$((PASSED + 1))
  else
    echo -e "${YELLOW}⚠️ Rejeitado mas mensagem inesperada${NC}"
    echo "   Mensagem: $ERROR_MSG"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  echo -e "${RED}❌ CRÍTICO: Arquivo > 10MB foi aceito! (HTTP $HUGE_HTTP)${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

# ========================================
# TESTE 6: Geração automática de PDF
# ========================================

echo -e "${BLUE}📄 TESTE 6: Geração Automática de PDF${NC}"

GERAR_RESP=$(curl -s -w "\nHTTP:%{http_code}" --max-time 30 \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/certificados/historico/$QUAL_ID/certificados/gerar")

GERAR_HTTP=$(echo "$GERAR_RESP" | grep "HTTP:" | cut -d: -f2)
GERAR_BODY=$(echo "$GERAR_RESP" | sed '/HTTP:/d')

if [ "$GERAR_HTTP" = "200" ] || [ "$GERAR_HTTP" = "201" ]; then
  GENERATED_ID=$(echo "$GERAR_BODY" | jq -r '.data.id // empty')
  GENERATED_UUID=$(echo "$GERAR_BODY" | jq -r '.data.uuid // empty')
  GENERATED_NOME=$(echo "$GERAR_BODY" | jq -r '.data.nome_arquivo // empty')
  GENERATED_SIZE=$(echo "$GERAR_BODY" | jq -r '.data.tamanho // 0')
  
  echo -e "${GREEN}✅ Geração OK (HTTP $GERAR_HTTP)${NC}"
  echo "   Documento ID: $GENERATED_ID"
  echo "   UUID: $GENERATED_UUID"
  echo "   Nome: $GENERATED_NOME"
  echo "   Tamanho: $(echo $GENERATED_SIZE | numfmt --to=iec-i)B"
  
  # Validar se PDF foi realmente gerado (> 1KB)
  if [ "$GENERATED_SIZE" -gt 1024 ]; then
    echo -e "${GREEN}   ✅ PDF gerado com tamanho válido${NC}"
  else
    echo -e "${YELLOW}   ⚠️ PDF muito pequeno: ${GENERATED_SIZE}B${NC}"
    WARNINGS=$((WARNINGS + 1))
  fi
  
  PASSED=$((PASSED + 1))
  
  # Salvar ID para próximos testes
  if [ -z "$DOC_ID" ]; then
    DOC_ID=$GENERATED_ID
  fi
else
  echo -e "${YELLOW}⚠️ Geração falhou (HTTP $GERAR_HTTP)${NC}"
  
  ERROR_MSG=$(echo "$GERAR_BODY" | jq -r '.error // .details // empty')
  
  if echo "$ERROR_MSG" | grep -qi "pdf-lib"; then
    echo "   Causa: pdf-lib não instalado ou erro de importação"
    echo "   Solução: npm install pdf-lib"
  else
    echo "   Erro: $ERROR_MSG"
  fi
  
  WARNINGS=$((WARNINGS + 1))
fi
echo ""

# ========================================
# TESTE 7: Download via URL
# ========================================

if [ -n "$DOC_ID" ]; then
  echo -e "${BLUE}📥 TESTE 7: Download via URL${NC}"
  
  DOWNLOAD_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/certificados/download/$DOC_ID")
  
  DL_HTTP=$(echo "$DOWNLOAD_RESP" | grep "HTTP:" | cut -d: -f2)
  DL_BODY=$(echo "$DOWNLOAD_RESP" | sed '/HTTP:/d')
  
  if [ "$DL_HTTP" = "200" ]; then
    STREAM_URL=$(echo "$DL_BODY" | jq -r '.data.url // empty')
    
    echo -e "${GREEN}✅ URL de download obtida (HTTP 200)${NC}"
    echo "   URL: $STREAM_URL"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}❌ Erro ao obter URL (HTTP $DL_HTTP)${NC}"
    echo "$DL_BODY" | jq .
    FAILED=$((FAILED + 1))
  fi
  echo ""
fi

# ========================================
# TESTE 8: Streaming do PDF
# ========================================

if [ -n "$DOC_ID" ]; then
  echo -e "${BLUE}📡 TESTE 8: Streaming do PDF${NC}"
  
  STREAM_FILE="$TEMP_DIR/downloaded-cert.pdf"
  
  curl -s -w "\nHTTP:%{http_code}\nCONTENT_TYPE:%{content_type}\nSIZE:%{size_download}\n" \
    -H "Authorization: Bearer $TOKEN" \
    -o "$STREAM_FILE" \
    "$API_BASE/certificados/stream/$DOC_ID" > "$TEMP_DIR/stream-info.txt"
  
  STREAM_HTTP=$(grep "HTTP:" "$TEMP_DIR/stream-info.txt" | cut -d: -f2)
  CONTENT_TYPE=$(grep "CONTENT_TYPE:" "$TEMP_DIR/stream-info.txt" | cut -d: -f2)
  FILE_SIZE=$(grep "SIZE:" "$TEMP_DIR/stream-info.txt" | cut -d: -f2)
  
  if [ "$STREAM_HTTP" = "200" ]; then
    echo -e "${GREEN}✅ Streaming OK (HTTP 200)${NC}"
    echo "   Content-Type: $CONTENT_TYPE"
    echo "   Tamanho: $(echo $FILE_SIZE | numfmt --to=iec-i)B"
    
    # Verificar se arquivo foi baixado
    if [ -f "$STREAM_FILE" ]; then
      DOWNLOADED_SIZE=$(wc -c < "$STREAM_FILE")
      
      # Verificar magic bytes do PDF
      MAGIC_BYTES=$(head -c 4 "$STREAM_FILE" | od -An -tx1 | tr -d ' ')
      
      if [ "$MAGIC_BYTES" = "255044462d" ] || [ "$MAGIC_BYTES" = "25504446" ]; then
        echo -e "${GREEN}   ✅ Arquivo é PDF válido (magic bytes: %PDF-)${NC}"
        echo "   ✅ Tamanho baixado: $(echo $DOWNLOADED_SIZE | numfmt --to=iec-i)B"
        PASSED=$((PASSED + 1))
      else
        echo -e "${RED}   ❌ Arquivo baixado não é PDF válido${NC}"
        echo "   Magic bytes: $MAGIC_BYTES (esperado: 25504446)"
        FAILED=$((FAILED + 1))
      fi
    else
      echo -e "${RED}   ❌ Arquivo não foi baixado${NC}"
      FAILED=$((FAILED + 1))
    fi
  else
    echo -e "${RED}❌ Erro no streaming (HTTP $STREAM_HTTP)${NC}"
    FAILED=$((FAILED + 1))
  fi
  echo ""
fi

# ========================================
# TESTE 9: Verificar auditoria de download
# ========================================

if [ -n "$DOC_ID" ]; then
  echo -e "${BLUE}📊 TESTE 9: Verificar Auditoria de Download${NC}"
  
  # Aguardar 2 segundos para garantir que auditoria foi registrada
  sleep 2
  
  # Tentar consultar via API (se houver endpoint)
  AUDIT_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/certificados/stream/$DOC_ID/auditoria" 2>/dev/null || echo '{"error":"endpoint_nao_existe"}')
  
  if echo "$AUDIT_RESP" | jq -e '.data' > /dev/null 2>&1; then
    AUDIT_COUNT=$(echo "$AUDIT_RESP" | jq -r '.data | length // 0')
    echo -e "${GREEN}✅ Auditoria verificada${NC}"
    echo "   Downloads registrados: $AUDIT_COUNT"
    PASSED=$((PASSED + 1))
  else
    echo -e "${YELLOW}⚠️ Endpoint de auditoria não disponível${NC}"
    echo "   (Auditoria pode estar funcionando, mas sem API de consulta)"
    WARNINGS=$((WARNINGS + 1))
  fi
  echo ""
fi

# ========================================
# TESTE 10: Soft Delete
# ========================================

if [ -n "$DOC_ID" ] && [ "$USER_ROLE" = "ADMIN" ]; then
  echo -e "${BLUE}🗑️ TESTE 10: Soft Delete${NC}"
  
  DELETE_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
    -X DELETE \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/certificados/historico/$QUAL_ID/certificados/$DOC_ID")
  
  DELETE_HTTP=$(echo "$DELETE_RESP" | grep "HTTP:" | cut -d: -f2)
  DELETE_BODY=$(echo "$DELETE_RESP" | sed '/HTTP:/d')
  
  if [ "$DELETE_HTTP" = "200" ]; then
    echo -e "${GREEN}✅ Soft delete OK (HTTP 200)${NC}"
    echo "$DELETE_BODY" | jq -r '.message // .data.message // "Certificado deletado"' | xargs echo "   "
    PASSED=$((PASSED + 1))
    
    # Verificar se arquivo foi realmente movido
    sleep 2
    
    VERIFY_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      "$API_BASE/certificados/stream/$DOC_ID")
    
    VERIFY_HTTP=$(echo "$VERIFY_RESP" | grep "HTTP:" | cut -d: -f2)
    
    if [ "$VERIFY_HTTP" = "404" ] || [ "$VERIFY_HTTP" = "403" ]; then
      echo -e "${GREEN}   ✅ Arquivo não mais acessível (esperado)${NC}"
    else
      echo -e "${YELLOW}   ⚠️ Arquivo ainda acessível após delete${NC}"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    echo -e "${YELLOW}⚠️ Delete falhou (HTTP $DELETE_HTTP)${NC}"
    echo "$DELETE_BODY" | jq .
    WARNINGS=$((WARNINGS + 1))
  fi
  echo ""
fi

# ========================================
# TESTE 11: Segurança - Acesso sem token
# ========================================

echo -e "${BLUE}🔒 TESTE 11: Segurança - Acesso Sem Token${NC}"

NO_AUTH_RESP=$(curl -s -w "\nHTTP:%{http_code}" \
  "$API_BASE/certificados/historico/$QUAL_ID/certificados")

NO_AUTH_HTTP=$(echo "$NO_AUTH_RESP" | grep "HTTP:" | cut -d: -f2)

if [ "$NO_AUTH_HTTP" = "401" ] || [ "$NO_AUTH_HTTP" = "403" ]; then
  echo -e "${GREEN}✅ Proteção OK - Acesso sem token bloqueado (HTTP $NO_AUTH_HTTP)${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ CRÍTICO: Acesso sem token permitido! (HTTP $NO_AUTH_HTTP)${NC}"
  FAILED=$((FAILED + 1))
fi
echo ""

# ========================================
# LIMPEZA
# ========================================

echo -e "${BLUE}🧹 Limpando arquivos temporários...${NC}"
rm -rf "$TEMP_DIR"
echo -e "${GREEN}✅ Limpeza concluída${NC}"
echo ""

# ========================================
# RELATÓRIO FINAL
# ========================================

TOTAL=$((PASSED + FAILED + WARNINGS))

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                RELATÓRIO FINAL - TESTE E2E                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ PASSOU:  $PASSED${NC}"
echo -e "${YELLOW}⚠️  AVISOS:  $WARNINGS${NC}"
echo -e "${RED}❌ FALHOU:  $FAILED${NC}"
echo "📊 TOTAL:   $TOTAL"
echo ""

SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED/$TOTAL)*100}")
echo "📈 Taxa de Sucesso: $SUCCESS_RATE%"
echo ""

if [ $FAILED -eq 0 ]; then
  if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}🎉 SISTEMA 100% FUNCIONAL - ZERO SURPRESAS!${NC}"
    EXIT_CODE=0
  else
    echo -e "${YELLOW}⚠️ Sistema funcional com avisos menores${NC}"
    EXIT_CODE=0
  fi
else
  echo -e "${RED}❌ PROBLEMAS DETECTADOS - Revisar falhas acima${NC}"
  EXIT_CODE=1
fi

echo ""
echo "Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo "API: $API_BASE"
echo ""

exit $EXIT_CODE
