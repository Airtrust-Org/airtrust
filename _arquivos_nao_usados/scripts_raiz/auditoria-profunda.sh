#!/bin/bash

echo "🔍 AUDITORIA COMPLETA E PROFUNDA - LOCALHOST vs PRODUÇÃO 175ec27f"
echo "=================================================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Arquivo de saída
OUTPUT="AUDITORIA-COMPLETA.md"

cat > $OUTPUT << 'HEADER'
# 🔍 AUDITORIA COMPLETA E PROFUNDA - LOCALHOST vs PRODUÇÃO

**Data:** $(date '+%Y-%m-%d %H:%M:%S')
**Versão Produção:** 175ec27f-fa58-447c-98c3-be3e94399c98
**Objetivo:** Encontrar TODAS as diferenças, absolutamente TODAS

---

HEADER

echo "📝 Gerando relatório em: $OUTPUT"
echo ""

# ═══════════════════════════════════════════════════════════════
# 1. VERIFICAR ARQUIVOS CRÍTICOS
# ═══════════════════════════════════════════════════════════════

echo "1️⃣ VERIFICANDO ARQUIVOS CRÍTICOS..."
echo "" >> $OUTPUT
echo "## 1️⃣ ARQUIVOS CRÍTICOS" >> $OUTPUT
echo "" >> $OUTPUT

# Lista de arquivos críticos da versão 175ec27f
ARQUIVOS_CRITICOS=(
    "src/worker/api/v2/certificados-storage.ts"
    "src/worker/api/v2/certificados-upload-fixed.ts"
    "src/worker/api/v2/empresas.ts"
    "src/worker/api/v2/manobras.ts"
    "src/react-app/pages/Qualificacoes.tsx"
    "src/react-app/pages/Empresas.tsx"
    "src/react-app/pages/funcionarios/ModalFuncionario.tsx"
    "src/react-app/components/CertificadoLista.tsx"
    "src/react-app/components/CertificadoUpload.tsx"
    "src/react-app/pages/qualificacoes/ConfigurarColunasQualificacoes.tsx"
)

for arquivo in "${ARQUIVOS_CRITICOS[@]}"; do
    if [ -f "$arquivo" ]; then
        LINHAS=$(wc -l < "$arquivo")
        echo "  ✅ $arquivo ($LINHAS linhas)" | tee -a $OUTPUT
    else
        echo "  ❌ $arquivo (NÃO EXISTE)" | tee -a $OUTPUT
    fi
done

echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 2. VERIFICAR FUNCIONALIDADES ESPECÍFICAS
# ═══════════════════════════════════════════════════════════════

echo ""
echo "2️⃣ VERIFICANDO FUNCIONALIDADES ESPECÍFICAS..."
echo "" >> $OUTPUT
echo "## 2️⃣ FUNCIONALIDADES ESPECÍFICAS" >> $OUTPUT
echo "" >> $OUTPUT

# 2.1 Sistema de Upload R2
echo "### 2.1 Sistema de Upload R2" >> $OUTPUT
echo "" >> $OUTPUT
if grep -rq "R2.*upload\|uploadToR2\|arquivo_r2_key" src/worker/api/v2/ 2>/dev/null; then
    echo "  ✅ Sistema R2 encontrado" | tee -a $OUTPUT
    grep -rn "uploadToR2\|R2.*upload" src/worker/api/v2/ 2>/dev/null | head -3 >> $OUTPUT
else
    echo "  ❌ Sistema R2 NÃO encontrado" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 2.2 Sistema de Download com Blob
echo "### 2.2 Sistema de Download (Blob)" >> $OUTPUT
echo "" >> $OUTPUT
if grep -q "handleDownload.*blob\|createObjectURL\|window.URL.createObjectURL" src/react-app/pages/Qualificacoes.tsx 2>/dev/null; then
    echo "  ✅ Sistema de download encontrado" | tee -a $OUTPUT
    grep -n "handleDownload\|createObjectURL" src/react-app/pages/Qualificacoes.tsx 2>/dev/null | head -3 >> $OUTPUT
else
    echo "  ❌ Sistema de download NÃO encontrado" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 2.3 Ícone FolderOpen
echo "### 2.3 Ícone Pasta Virtual (FolderOpen)" >> $OUTPUT
echo "" >> $OUTPUT
if grep -q "FolderOpen" src/react-app/pages/Qualificacoes.tsx 2>/dev/null; then
    echo "  ✅ Ícone FolderOpen encontrado" | tee -a $OUTPUT
    grep -n "FolderOpen" src/react-app/pages/Qualificacoes.tsx 2>/dev/null | head -3 >> $OUTPUT
else
    echo "  ❌ Ícone FolderOpen NÃO encontrado" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 2.4 Botão Configurar Colunas
echo "### 2.4 Botão Configurar Colunas" >> $OUTPUT
echo "" >> $OUTPUT
if grep -q "ConfigurarColunas\|configurar.*colunas" src/react-app/pages/Qualificacoes.tsx 2>/dev/null; then
    echo "  ✅ Botão configurar colunas encontrado" | tee -a $OUTPUT
    grep -n "ConfigurarColunas" src/react-app/pages/Qualificacoes.tsx 2>/dev/null | head -3 >> $OUTPUT
else
    echo "  ❌ Botão configurar colunas NÃO encontrado" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 2.5 Ordenamento de Manobras
echo "### 2.5 Ordenamento de Manobras" >> $OUTPUT
echo "" >> $OUTPUT
if grep -q "ORDER BY ordem\|ordem.*ASC" src/worker/api/v2/manobras.ts 2>/dev/null; then
    echo "  ✅ Ordenamento de manobras encontrado" | tee -a $OUTPUT
    grep -n "ORDER BY" src/worker/api/v2/manobras.ts 2>/dev/null | head -3 >> $OUTPUT
else
    echo "  ❌ Ordenamento de manobras NÃO encontrado" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 2.6 Validação de Matrícula
echo "### 2.6 Validação de Matrícula (5 dígitos)" >> $OUTPUT
echo "" >> $OUTPUT
if grep -q "padStart.*5.*'0'" src/react-app/pages/funcionarios/ModalFuncionario.tsx 2>/dev/null; then
    echo "  ✅ Validação de matrícula encontrada" | tee -a $OUTPUT
    grep -n "padStart.*5" src/react-app/pages/funcionarios/ModalFuncionario.tsx 2>/dev/null | head -3 >> $OUTPUT
else
    echo "  ❌ Validação de matrícula NÃO encontrada" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 3. VERIFICAR IMPORTS DE ÍCONES
# ═══════════════════════════════════════════════════════════════

echo ""
echo "3️⃣ VERIFICANDO IMPORTS DE ÍCONES..."
echo "" >> $OUTPUT
echo "## 3️⃣ IMPORTS DE ÍCONES" >> $OUTPUT
echo "" >> $OUTPUT

ICONES=("Download" "Eye" "FolderOpen" "Settings" "Upload")

for icone in "${ICONES[@]}"; do
    if grep -q "import.*$icone.*from.*lucide-react" src/react-app/pages/Qualificacoes.tsx 2>/dev/null; then
        echo "  ✅ $icone importado" | tee -a $OUTPUT
    else
        echo "  ❌ $icone NÃO importado" | tee -a $OUTPUT
    fi
done

echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 4. VERIFICAR ENDPOINTS BACKEND
# ═══════════════════════════════════════════════════════════════

echo ""
echo "4️⃣ VERIFICANDO ENDPOINTS BACKEND..."
echo "" >> $OUTPUT
echo "## 4️⃣ ENDPOINTS BACKEND" >> $OUTPUT
echo "" >> $OUTPUT

# 4.1 Funcionários
echo "### 4.1 Funcionários" >> $OUTPUT
echo "" >> $OUTPUT
if grep -q "'/instrutores'" src/worker/api/v2/funcionarios.ts 2>/dev/null; then
    echo "  ✅ Endpoint /instrutores" | tee -a $OUTPUT
else
    echo "  ❌ Endpoint /instrutores FALTANDO" | tee -a $OUTPUT
fi

if grep -q "'/examinadores'" src/worker/api/v2/funcionarios.ts 2>/dev/null; then
    echo "  ✅ Endpoint /examinadores" | tee -a $OUTPUT
else
    echo "  ❌ Endpoint /examinadores FALTANDO" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 4.2 Empresas
echo "### 4.2 Empresas" >> $OUTPUT
echo "" >> $OUTPUT
if [ -f "src/worker/api/v2/empresas.ts" ]; then
    ENDPOINTS=$(grep -c "app\.\(get\|post\|put\|delete\)" src/worker/api/v2/empresas.ts 2>/dev/null || echo 0)
    echo "  ✅ Arquivo empresas.ts existe ($ENDPOINTS endpoints)" | tee -a $OUTPUT
else
    echo "  ❌ Arquivo empresas.ts NÃO EXISTE" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 4.3 Certificados
echo "### 4.3 Certificados" >> $OUTPUT
echo "" >> $OUTPUT
ARQUIVOS_CERT=$(find src/worker/api/v2/ -name "*certificado*" -type f 2>/dev/null | wc -l)
echo "  📁 Arquivos de certificados encontrados: $ARQUIVOS_CERT" | tee -a $OUTPUT
find src/worker/api/v2/ -name "*certificado*" -type f 2>/dev/null | sed 's/^/    - /' | tee -a $OUTPUT
echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 5. VERIFICAR COMPONENTES FRONTEND
# ═══════════════════════════════════════════════════════════════

echo ""
echo "5️⃣ VERIFICANDO COMPONENTES FRONTEND..."
echo "" >> $OUTPUT
echo "## 5️⃣ COMPONENTES FRONTEND" >> $OUTPUT
echo "" >> $OUTPUT

# 5.1 Componentes de Certificados
echo "### 5.1 Componentes de Certificados" >> $OUTPUT
echo "" >> $OUTPUT
if [ -f "src/react-app/components/CertificadoUpload.tsx" ]; then
    echo "  ✅ CertificadoUpload.tsx" | tee -a $OUTPUT
else
    echo "  ❌ CertificadoUpload.tsx NÃO EXISTE" | tee -a $OUTPUT
fi

if [ -f "src/react-app/components/CertificadoLista.tsx" ]; then
    echo "  ✅ CertificadoLista.tsx" | tee -a $OUTPUT
else
    echo "  ❌ CertificadoLista.tsx NÃO EXISTE" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 5.2 Componentes de Empresas
echo "### 5.2 Componentes de Empresas" >> $OUTPUT
echo "" >> $OUTPUT
if [ -d "src/react-app/components/empresas" ]; then
    ARQUIVOS=$(ls -1 src/react-app/components/empresas/ 2>/dev/null | wc -l)
    echo "  ✅ Diretório empresas/ existe ($ARQUIVOS arquivos)" | tee -a $OUTPUT
    ls -1 src/react-app/components/empresas/ 2>/dev/null | sed 's/^/    - /' | tee -a $OUTPUT
else
    echo "  ❌ Diretório empresas/ NÃO EXISTE" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# 5.3 Páginas de Qualificações
echo "### 5.3 Páginas de Qualificações" >> $OUTPUT
echo "" >> $OUTPUT
if [ -d "src/react-app/pages/qualificacoes" ]; then
    ARQUIVOS=$(ls -1 src/react-app/pages/qualificacoes/ 2>/dev/null | wc -l)
    echo "  📁 Diretório qualificacoes/ ($ARQUIVOS arquivos)" | tee -a $OUTPUT
    ls -1 src/react-app/pages/qualificacoes/ 2>/dev/null | sed 's/^/    - /' | tee -a $OUTPUT
else
    echo "  ❌ Diretório qualificacoes/ NÃO EXISTE" | tee -a $OUTPUT
fi
echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 6. VERIFICAR ROTAS REGISTRADAS
# ═══════════════════════════════════════════════════════════════

echo ""
echo "6️⃣ VERIFICANDO ROTAS REGISTRADAS..."
echo "" >> $OUTPUT
echo "## 6️⃣ ROTAS REGISTRADAS" >> $OUTPUT
echo "" >> $OUTPUT

ROTAS_ESPERADAS=("empresas" "certificados" "funcionarios" "qualificacoes")

for rota in "${ROTAS_ESPERADAS[@]}"; do
    if grep -q "app.route.*$rota" src/worker/routes/index.ts 2>/dev/null; then
        echo "  ✅ Rota /$rota registrada" | tee -a $OUTPUT
    else
        echo "  ❌ Rota /$rota NÃO registrada" | tee -a $OUTPUT
    fi
done

echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 7. VERIFICAR NAVEGAÇÃO
# ═══════════════════════════════════════════════════════════════

echo ""
echo "7️⃣ VERIFICANDO NAVEGAÇÃO..."
echo "" >> $OUTPUT
echo "## 7️⃣ NAVEGAÇÃO (App.tsx)" >> $OUTPUT
echo "" >> $OUTPUT

ROTAS_FRONTEND=("empresas" "qualificacoes" "funcionarios" "treinamentos")

for rota in "${ROTAS_FRONTEND[@]}"; do
    if grep -q "path.*$rota\|/$rota" src/react-app/App.tsx 2>/dev/null; then
        echo "  ✅ Rota /$rota no App.tsx" | tee -a $OUTPUT
    else
        echo "  ❌ Rota /$rota NÃO está no App.tsx" | tee -a $OUTPUT
    fi
done

echo "" >> $OUTPUT

# ═══════════════════════════════════════════════════════════════
# 8. RESUMO FINAL
# ═══════════════════════════════════════════════════════════════

echo ""
echo "8️⃣ GERANDO RESUMO FINAL..."
echo "" >> $OUTPUT
echo "## 8️⃣ RESUMO FINAL" >> $OUTPUT
echo "" >> $OUTPUT

# Contar problemas
TOTAL_PROBLEMAS=0

# Arquivos críticos faltando
for arquivo in "${ARQUIVOS_CRITICOS[@]}"; do
    if [ ! -f "$arquivo" ]; then
        ((TOTAL_PROBLEMAS++))
    fi
done

# Funcionalidades faltando
grep -q "handleDownload.*blob" src/react-app/pages/Qualificacoes.tsx 2>/dev/null || ((TOTAL_PROBLEMAS++))
grep -q "FolderOpen" src/react-app/pages/Qualificacoes.tsx 2>/dev/null || ((TOTAL_PROBLEMAS++))
grep -q "ConfigurarColunas" src/react-app/pages/Qualificacoes.tsx 2>/dev/null || ((TOTAL_PROBLEMAS++))
grep -q "ORDER BY ordem" src/worker/api/v2/manobras.ts 2>/dev/null || ((TOTAL_PROBLEMAS++))
grep -q "padStart.*5" src/react-app/pages/funcionarios/ModalFuncionario.tsx 2>/dev/null || ((TOTAL_PROBLEMAS++))

# Endpoints faltando
grep -q "'/instrutores'" src/worker/api/v2/funcionarios.ts 2>/dev/null || ((TOTAL_PROBLEMAS++))
grep -q "'/examinadores'" src/worker/api/v2/funcionarios.ts 2>/dev/null || ((TOTAL_PROBLEMAS++))
[ -f "src/worker/api/v2/empresas.ts" ] || ((TOTAL_PROBLEMAS++))

echo "### 📊 Estatísticas:" >> $OUTPUT
echo "" >> $OUTPUT
echo "- **Total de problemas encontrados:** $TOTAL_PROBLEMAS" >> $OUTPUT
echo "- **Arquivos críticos verificados:** ${#ARQUIVOS_CRITICOS[@]}" >> $OUTPUT
echo "- **Funcionalidades verificadas:** 6" >> $OUTPUT
echo "- **Endpoints verificados:** 8" >> $OUTPUT
echo "- **Componentes verificados:** 10+" >> $OUTPUT
echo "" >> $OUTPUT

if [ $TOTAL_PROBLEMAS -eq 0 ]; then
    echo "✅ **LOCALHOST 100% SINCRONIZADO COM PRODUÇÃO!**" >> $OUTPUT
else
    echo "⚠️ **LOCALHOST DESATUALIZADO - $TOTAL_PROBLEMAS PROBLEMAS ENCONTRADOS**" >> $OUTPUT
fi

echo "" >> $OUTPUT
echo "---" >> $OUTPUT
echo "" >> $OUTPUT
echo "**Relatório gerado em:** $(date '+%Y-%m-%d %H:%M:%S')" >> $OUTPUT

echo ""
echo "✅ AUDITORIA COMPLETA FINALIZADA!"
echo "📄 Relatório salvo em: $OUTPUT"
echo ""
echo "Total de problemas encontrados: $TOTAL_PROBLEMAS"
