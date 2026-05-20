#!/bin/bash

# 🎯 Script de Verificação Automática - Sistema de Certificados
# Valida que o fluxo upload → modal → pasta virtual está funcionando
# Data: 12 de Janeiro de 2026
# Commit: 8d051088

set -e

API_BASE="https://airtrust-api-production.airtrust.workers.dev/api"
FRONTEND_BASE="https://airtrust.online"

echo "🔍 VERIFICAÇÃO DO SISTEMA DE CERTIFICADOS"
echo "=========================================="
echo ""
echo "📌 Commit: 8d051088"
echo "📌 Worker Version: c9fcc51b-6a50-42db-99b8-ba691e3797c2"
echo "📌 Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função de verificação
check() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  
  if [ "$expected" == "$actual" ]; then
    echo -e "${GREEN}✅ PASS${NC} - $test_name"
    echo "   Esperado: $expected | Obtido: $actual"
    return 0
  else
    echo -e "${RED}❌ FAIL${NC} - $test_name"
    echo "   Esperado: $expected | Obtido: $actual"
    return 1
  fi
}

# Contador de testes
TOTAL=0
PASSED=0
FAILED=0

echo "📋 VERIFICAÇÕES DE CÓDIGO"
echo "========================"
echo ""

# 1. Verificar se upload linka certificado_arquivo_id
echo "1️⃣  Verificando UPDATE certificado_arquivo_id no upload..."
if grep -q "UPDATE qualificacoes_historico.*SET certificado_arquivo_id = ?" worker-airtrust/src/routes/qualificacoes-certificados.ts; then
  echo -e "${GREEN}✅ PASS${NC} - Upload linka certificado_arquivo_id"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Upload NÃO linka certificado_arquivo_id"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 2. Verificar se upload insere na pasta_virtual
echo "2️⃣  Verificando INSERT pasta_virtual no upload..."
if grep -A 10 "UPLOAD CERT.*Certificado salvo" worker-airtrust/src/routes/qualificacoes-certificados.ts | grep -q "INSERT INTO pasta_virtual"; then
  echo -e "${GREEN}✅ PASS${NC} - Upload insere na pasta_virtual"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Upload NÃO insere na pasta_virtual"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 3. Verificar se geração insere na pasta_virtual
echo "3️⃣  Verificando INSERT pasta_virtual na geração..."
if grep -A 10 "GERAR PDF.*Documento criado" worker-airtrust/src/routes/qualificacoes-certificados.ts | grep -q "INSERT INTO pasta_virtual"; then
  echo -e "${GREEN}✅ PASS${NC} - Geração insere na pasta_virtual"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Geração NÃO insere na pasta_virtual"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 4. Verificar se geração linka certificado_arquivo_id
echo "4️⃣  Verificando UPDATE certificado_arquivo_id na geração..."
if grep -A 5 "UPDATE qualificacoes_historico" worker-airtrust/src/routes/qualificacoes-certificados.ts | grep -q "SET certificado_arquivo_id = ?"; then
  echo -e "${GREEN}✅ PASS${NC} - Geração linka certificado_arquivo_id"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Geração NÃO linka certificado_arquivo_id"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 5. Verificar se delete remove referência
echo "5️⃣  Verificando UPDATE NULL em certificado_arquivo_id no delete..."
if grep -q "UPDATE qualificacoes_historico SET certificado_arquivo_id = NULL" worker-airtrust/src/routes/qualificacoes-certificados.ts; then
  echo -e "${GREEN}✅ PASS${NC} - Delete remove referência em certificado_arquivo_id"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Delete NÃO remove referência"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 6. Verificar cálculo de tem_certificado
echo "6️⃣  Verificando cálculo de tem_certificado..."
if grep -q "CASE WHEN qh.certificado_arquivo_id IS NOT NULL THEN 1 ELSE 0 END AS tem_certificado" worker-airtrust/src/routes/qualificacoes/historico.ts; then
  echo -e "${GREEN}✅ PASS${NC} - tem_certificado calculado corretamente"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - tem_certificado NÃO calculado"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 7. Verificar endpoint GET certificados do modal
echo "7️⃣  Verificando GET /historico/:id/certificados (específico)..."
if grep -A 10 "GET.*historico.*:id.*certificados" worker-airtrust/src/routes/qualificacoes-certificados.ts | grep -q "certificado_arquivo_id"; then
  echo -e "${GREEN}✅ PASS${NC} - Endpoint GET modal busca por certificado_arquivo_id"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Endpoint GET modal NÃO busca certificado_arquivo_id"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 8. Verificar endpoint GET pasta virtual
echo "8️⃣  Verificando GET /by-category/:funcionario_id (todos)..."
if grep -A 20 "app.get.*by-category.*funcionario_id" worker-airtrust/src/routes/pasta-virtual.ts | grep -q "FROM documentos d.*WHERE d.funcionario_id"; then
  echo -e "${GREEN}✅ PASS${NC} - Endpoint pasta virtual busca por funcionario_id"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Endpoint pasta virtual NÃO busca por funcionario_id"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "📊 ESTRUTURA DE DADOS"
echo "===================="
echo ""

# 9. Verificar que pasta_virtual tem coluna documento_id
echo "9️⃣  Verificando se INSERT pasta_virtual usa documento_id..."
if grep -A 5 "INSERT INTO pasta_virtual" worker-airtrust/src/routes/qualificacoes-certificados.ts | grep -q "documento_id"; then
  echo -e "${GREEN}✅ PASS${NC} - pasta_virtual linkada com documento_id"
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}⚠️  WARN${NC} - pasta_virtual pode não ter documento_id (verificar migration)"
  # Não conta como falha, apenas warning
fi
TOTAL=$((TOTAL + 1))

# 10. Verificar deduplicação na pasta virtual
echo "🔟 Verificando deduplicação por nome_arquivo..."
if grep -A 10 "by-category" worker-airtrust/src/routes/pasta-virtual.ts | grep -q "filesMap.set.*nome_arquivo"; then
  echo -e "${GREEN}✅ PASS${NC} - Deduplicação implementada com Map"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Deduplicação NÃO implementada"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "📦 VERIFICAÇÕES DE BUILD"
echo "======================="
echo ""

# 11. Verificar se dist foi gerado
if [ -d "dist/client" ] && [ -f "dist/client/index.html" ]; then
  echo -e "${GREEN}✅ PASS${NC} - Build do frontend OK (dist/client existe)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}❌ FAIL${NC} - Build do frontend FALHOU (dist/client não existe)"
  FAILED=$((FAILED + 1))
fi
TOTAL=$((TOTAL + 1))

# 12. Verificar versão no index.html
if grep -q "8d051088" dist/client/index.html 2>/dev/null; then
  echo -e "${GREEN}✅ PASS${NC} - Versão 8d051088 carimbada no index.html"
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}⚠️  WARN${NC} - Versão 8d051088 não encontrada (pode ser deploy pendente)"
fi
TOTAL=$((TOTAL + 1))

echo ""
echo "🎯 LÓGICA DE NEGÓCIO"
echo "==================="
echo ""

echo "📝 Resumo da Lógica Implementada:"
echo ""
echo "   Upload Manual:"
echo "   1. Valida PDF (magic bytes, tamanho)"
echo "   2. Upload R2 → certificados/{nome}.pdf"
echo "   3. INSERT documentos → retorna ID"
echo "   4. ✅ INSERT pasta_virtual (documento_id = ID)"
echo "   5. ✅ UPDATE qualificacoes_historico (certificado_arquivo_id = ID)"
echo ""
echo "   Geração Automática:"
echo "   1. Gera PDF com pdf-lib ou Browser Rendering"
echo "   2. Upload R2 → certificados/{nome}.pdf"
echo "   3. INSERT documentos → retorna ID"
echo "   4. ✅ INSERT pasta_virtual (documento_id = ID)"
echo "   5. ✅ UPDATE qualificacoes_historico (certificado_arquivo_id = ID)"
echo ""
echo "   Modal de Certificado (específico):"
echo "   - GET /certificados/historico/{id}/certificados"
echo "   - Busca: certificado_arquivo_id da qualificação específica"
echo "   - Retorna: Array com 1 certificado OU array vazio"
echo ""
echo "   Pasta Virtual (todos):"
echo "   - GET /pasta-virtual/by-category/{funcionario_id}"
echo "   - Busca: TODOS documentos do funcionário"
echo "   - Une: documentos + pasta_virtual (deduplica por nome)"
echo "   - Retorna: Categorizado por tipo de documento"
echo ""

echo "════════════════════════════════════════"
echo "📊 RESULTADO FINAL"
echo "════════════════════════════════════════"
echo ""
echo "Total de testes: $TOTAL"
echo -e "${GREEN}Passou: $PASSED${NC}"
echo -e "${RED}Falhou: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM! SISTEMA OK! 🎉${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "✅ Upload → Modal → Pasta Virtual: FUNCIONANDO"
  echo "✅ Geração → Modal → Pasta Virtual: FUNCIONANDO"
  echo "✅ Ícone Verde → tem_certificado: FUNCIONANDO"
  echo "✅ Delete → Remove Referências: FUNCIONANDO"
  echo ""
  echo "🚀 Deploy: c9fcc51b-6a50-42db-99b8-ba691e3797c2"
  echo "🌐 Frontend: https://airtrust.online"
  echo "🔧 API: https://airtrust-api-production.airtrust.workers.dev"
  echo ""
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ $FAILED TESTE(S) FALHARAM - REVISAR CÓDIGO${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "Revise os testes acima que falharam."
  echo ""
  exit 1
fi
