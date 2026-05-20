#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "📁 VALIDANDO ESTRUTURA DE ARQUIVOS..."
echo ""

check_file() {
    if [ -f "$1" ]; then
        echo -e "  ${GREEN}✅${NC} $1"
    else
        echo -e "  ${RED}❌${NC} $1 (FALTANDO!)"
    fi
}

echo "📂 BACKEND - API v2:"
check_file "src/worker/api/v2/empresas.ts"
check_file "src/worker/api/v2/funcionarios.ts"
check_file "src/worker/api/v2/manobras.ts"
check_file "src/worker/api/v2/certificados-storage.ts"
check_file "src/worker/api/v2/fichas-pdf-storage.ts"

echo ""
echo "📂 BACKEND - Types:"
check_file "src/worker/types/env.ts"

echo ""
echo "📂 BACKEND - Routes:"
check_file "src/worker/routes/index.ts"

echo ""
echo "📂 FRONTEND - Pages:"
check_file "src/react-app/pages/Empresas.tsx"
check_file "src/react-app/pages/Qualificacoes.tsx"
check_file "src/react-app/pages/funcionarios/ModalFuncionario.tsx"

echo ""
echo "📂 FRONTEND - Components:"
check_file "src/react-app/components/empresas/FormularioEmpresa.tsx"
check_file "src/react-app/components/empresas/UploadLogo.tsx"
check_file "src/react-app/pages/qualificacoes/ConfigurarColunasQualificacoes.tsx"

echo ""
echo "📂 CONFIG:"
check_file "wrangler.json"
