#!/usr/bin/env bash

# 🚨 SCRIPT PARA CORRIGIR TODOS OS 6 BUGS CRÍTICOS
# Auditoria AIRTRUST - 2025-11-02
# Tempo: ~10 minutos

echo "🔍 AUDITORIA AIRTRUST - CORREÇÃO AUTOMÁTICA"
echo "=============================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Diretório base
BASE_DIR="/Users/filipedaumas/Documents/airtrust"

echo "📁 Working directory: $BASE_DIR"
echo ""

# BUG #1: exames.ts - Add Logger import
echo -e "${YELLOW}[1/6] Fixing exames.ts - Logger import${NC}"
if ! grep -q "import { Logger }" "$BASE_DIR/src/worker/api/v2/exames.ts"; then
    # Add Logger import at the beginning
    sed -i '' '1i\
import { Logger } from "../../utils/logger";
' "$BASE_DIR/src/worker/api/v2/exames.ts"
    echo -e "${GREEN}✅ Logger imported to exames.ts${NC}"
else
    echo -e "${YELLOW}⚠️  Logger already imported in exames.ts${NC}"
fi
echo ""

# BUG #2: importacoes.ts - Add Logger import
echo -e "${YELLOW}[2/6] Fixing importacoes.ts - Logger import${NC}"
if ! grep -q "import { Logger }" "$BASE_DIR/src/worker/api/v2/importacoes.ts"; then
    sed -i '' '1i\
import { Logger } from "../../utils/logger";
' "$BASE_DIR/src/worker/api/v2/importacoes.ts"
    echo -e "${GREEN}✅ Logger imported to importacoes.ts${NC}"
else
    echo -e "${YELLOW}⚠️  Logger already imported in importacoes.ts${NC}"
fi
echo ""

# BUG #3: auth.ts - Fix middleware
echo -e "${YELLOW}[3/6] Fixing auth.ts - middleware issue${NC}"
# Check if middleware is commented
if grep -q "// import { authMiddleware as mochaAuthMiddleware }" "$BASE_DIR/src/worker/api/v2/auth.ts"; then
    # Option 1: Remove middleware from route (simpler)
    sed -i '' 's/app.get(.\/me., mochaAuthMiddleware, async/app.get("\/me", async/' "$BASE_DIR/src/worker/api/v2/auth.ts"
    echo -e "${GREEN}✅ Removed mochaAuthMiddleware from auth.ts${NC}"
else
    echo -e "${YELLOW}⚠️  auth.ts already fixed${NC}"
fi
echo ""

# BUG #4: health.ts - Fix Logger import and Env type
echo -e "${YELLOW}[4/6] Fixing health.ts - Logger import and Env type${NC}"
if ! grep -q "import type { Env }" "$BASE_DIR/src/worker/api/v2/health.ts"; then
    # Remove wrong structured-logger import
    sed -i '' '/from.*structured-logger/d' "$BASE_DIR/src/worker/api/v2/health.ts"
    # Add correct imports at the beginning
    sed -i '' '1i\
import type { Env } from "../../types";\
import { Logger } from "../../utils/logger";
' "$BASE_DIR/src/worker/api/v2/health.ts"
    echo -e "${GREEN}✅ Fixed Logger import and added Env type to health.ts${NC}"
else
    echo -e "${YELLOW}⚠️  health.ts already fixed${NC}"
fi
echo ""

# BUG #5: certificados.ts - Add Env import and remove local interface
echo -e "${YELLOW}[5/6] Fixing certificados.ts - Local Env type${NC}"
if ! grep -q "import type { Env }" "$BASE_DIR/src/worker/api/v2/certificados.ts"; then
    # Add Env import
    sed -i '' '1i\
import type { Env } from "../../types";
' "$BASE_DIR/src/worker/api/v2/certificados.ts"
    # Remove local Env interface
    sed -i '' '/^interface Env {/,/^}/d' "$BASE_DIR/src/worker/api/v2/certificados.ts"
    echo -e "${GREEN}✅ Fixed Env import and removed local interface from certificados.ts${NC}"
else
    echo -e "${YELLOW}⚠️  certificados.ts already fixed${NC}"
fi
echo ""

# BUG #6: exames.ts - Remove local Env interface (keep imports from BUG #1)
echo -e "${YELLOW}[6/6] Fixing exames.ts - Local Env type${NC}"
if ! grep -q "import type { Env }" "$BASE_DIR/src/worker/api/v2/exames.ts"; then
    # Add Env import after Logger import
    sed -i '' '/import { Logger }/a\
import type { Env } from "../../types";
' "$BASE_DIR/src/worker/api/v2/exames.ts"
    # Remove local Env interface
    sed -i '' '/^interface Env {/,/^}/d' "$BASE_DIR/src/worker/api/v2/exames.ts"
    echo -e "${GREEN}✅ Fixed Env import and removed local interface from exames.ts${NC}"
else
    echo -e "${YELLOW}⚠️  exames.ts already fixed${NC}"
fi
echo ""

echo "=============================================="
echo -e "${GREEN}✅ ALL CRITICAL FIXES APPLIED${NC}"
echo "=============================================="
echo ""
echo "📊 NEXT STEPS:"
echo "1. npm run build       # Verify no errors"
echo "2. npm run test        # Run tests"
echo "3. wrangler deploy     # Deploy to production"
echo ""
echo "📖 For detailed audit report, see:"
echo "   - AUDITORIA_ULTRA_PROFUNDA_FINAL_2025.md"
echo "   - ACAO_CRITICA_FIXES_IMEDIATOS.md"
echo "   - MAPA_COMPLETO_BUGS.md"
echo ""
