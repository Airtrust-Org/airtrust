#!/bin/bash

echo "🔍 ============================================"
echo "🔍 AUDITORIA AUTOMÁTICA - SISTEMA CERTIFICADOS"
echo "🔍 AirTrust v1 - 29/11/2025"
echo "🔍 ============================================"
echo ""

OUTPUT_FILE="AUDITORIA_CERTIFICADOS_RESULTADO.md"
echo "📝 Salvando em: $OUTPUT_FILE"
echo ""

{
  echo "# 🔍 AUDITORIA COMPLETA - SISTEMA DE CERTIFICADOS"
  echo ""
  echo "**Data**: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "**Branch**: $(git branch --show-current)"
  echo ""
  echo "---"
  echo ""

  echo "## 1️⃣ SCHEMA D1 - Tabela documentos"
  echo ""
  echo "### Estrutura Atual:"
  echo '```sql'
  grep -A30 "CREATE TABLE documentos" worker-airtrust/migrations/0136_rebuild_all_funcionarios_old_refs.sql | head -20
  echo '```'
  echo ""

  echo "## 2️⃣ SCHEMA D1 - Tabela qualificacoes_historico"
  echo ""
  echo "### Estrutura Atual:"
  echo '```sql'
  grep -A50 "CREATE TABLE qualificacoes_historico (" worker-airtrust/migrations/0113_make_historico_ids_nullable.sql | head -40
  echo '```'
  echo ""

  echo "## 3️⃣ BACKEND - Rotas de Certificados"
  echo ""
  echo "### Arquivo: worker-airtrust/src/routes/qualificacoes-certificados.ts"
  echo '```'
  grep -n "app\.\(get\|post\|delete\)" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null | head -20
  echo '```'
  echo ""

  echo "## 4️⃣ BACKEND - Registro de Rotas no index.ts"
  echo ""
  echo '```typescript'
  grep -B2 -A2 "certificados" worker-airtrust/src/index.ts | grep -v "^--$"
  echo '```'
  echo ""

  echo "## 5️⃣ FRONTEND - Componente CertificadoGestaoModal.tsx"
  echo ""
  echo "### Endpoints Chamados:"
  echo '```typescript'
  grep "API_BASE_URL.*certificado" src/react-app/components/CertificadoGestaoModal.tsx | head -10
  echo '```'
  echo ""

  echo "## 6️⃣ R2 BUCKET - Configuração wrangler.toml"
  echo ""
  echo '```toml'
  grep -A3 "r2_buckets" worker-airtrust/wrangler.toml | head -8
  echo '```'
  echo ""

  echo "## 7️⃣ NOMENCLATURA R2 - Utilitário"
  echo ""
  echo "### Arquivo: worker-airtrust/src/lib/nomenclatura-padronizada.ts"
  if [ -f "worker-airtrust/src/lib/nomenclatura-padronizada.ts" ]; then
    echo '```typescript'
    grep -A10 "gerarNomeArquivoPadronizado" worker-airtrust/src/lib/nomenclatura-padronizada.ts | head -15
    echo '```'
  else
    echo "❌ Arquivo não encontrado!"
  fi
  echo ""

  echo "## 8️⃣ ENDPOINTS BACKEND - Resumo"
  echo ""
  echo "| Método | Rota | Descrição |"
  echo "|--------|------|-----------|"
  grep "app\.\(get\|post\|delete\)" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null | \
    sed 's/^.*app\.\([a-z]*\)(/\1/' | \
    sed "s/'\/\([^']*\)'.*/\/\1/" | \
    awk '{printf "| %s | %s | |\n", toupper($1), $2}' | head -10
  echo ""

  echo "## 9️⃣ ARQUIVO ATUAL - CertificadoGestaoModal.tsx"
  echo ""
  echo "### Linhas de Interesse:"
  echo '```typescript'
  grep -n "fetch.*certificado\|handleUpload\|handleBaixar\|handleGerar" src/react-app/components/CertificadoGestaoModal.tsx | head -15
  echo '```'
  echo ""

  echo "## 🔟 CHECKLIST DE VALIDAÇÃO"
  echo ""
  echo "### Backend Routes:"
  if grep -q "GET /historico/:id/certificados" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null; then
    echo "- ✅ GET /historico/:id/certificados (listar)"
  else
    echo "- ❌ GET /historico/:id/certificados (listar)"
  fi
  
  if grep -q "POST.*upload" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null; then
    echo "- ✅ POST /historico/:id/certificados/upload"
  else
    echo "- ❌ POST /historico/:id/certificados/upload"
  fi
  
  if grep -q "POST.*gerar" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null; then
    echo "- ✅ POST /historico/:id/certificados/gerar"
  else
    echo "- ❌ POST /historico/:id/certificados/gerar"
  fi
  
  if grep -q "GET /download" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null; then
    echo "- ✅ GET /download/:id"
  else
    echo "- ❌ GET /download/:id"
  fi

  if grep -q "GET /stream" worker-airtrust/src/routes/qualificacoes-certificados.ts 2>/dev/null; then
    echo "- ✅ GET /stream/:id"
  else
    echo "- ❌ GET /stream/:id"
  fi
  echo ""

  echo "### Frontend Endpoints:"
  if grep -q "/certificados/historico" src/react-app/components/CertificadoGestaoModal.tsx 2>/dev/null; then
    echo "- ✅ Usando path correto /api/certificados/"
  else
    echo "- ⚠️ Verificar path dos endpoints"
  fi
  echo ""

  echo "### R2 Configuration:"
  if grep -q "binding = \"BUCKET\"" worker-airtrust/wrangler.toml 2>/dev/null; then
    echo "- ✅ R2 bucket configurado (binding: BUCKET)"
  else
    echo "- ❌ R2 bucket não configurado"
  fi
  echo ""

  echo "### Nomenclatura Padrão:"
  if [ -f "worker-airtrust/src/lib/nomenclatura-padronizada.ts" ]; then
    echo "- ✅ Utilitário de nomenclatura existe"
  else
    echo "- ❌ Utilitário de nomenclatura não encontrado"
  fi
  echo ""

  echo "---"
  echo ""
  echo "## 📋 PRÓXIMOS PASSOS"
  echo ""
  echo "1. **Revisar este relatório** e identificar gaps"
  echo "2. **Testar endpoints manualmente** com curl/Postman"
  echo "3. **Verificar tabela documentos** no D1 (se tem dados)"
  echo "4. **Validar nomenclatura R2** no bucket airtrust-storage"
  echo "5. **Criar prompt de correção** baseado nos gaps identificados"
  echo ""

} | tee "$OUTPUT_FILE"

echo ""
echo "✅ Auditoria completa salva em: $OUTPUT_FILE"
echo ""
echo "📤 Próximo passo: Revisar o arquivo e compartilhar no chat"
echo ""
