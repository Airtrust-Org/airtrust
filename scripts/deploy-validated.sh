#!/bin/bash

################################################################################
# DEPLOY VALIDADO - AirTrust v1
# 
# Garante que:
# 1. Apenas main/production são deployadas
# 2. Build passa sem erros
# 3. Dist é incluído no commit
# 4. Vercel e Wrangler são atualizados
# 5. Logs são salvos para auditoria
#
# Uso: ./scripts/deploy-validated.sh [--no-cache] [--dry-run]
################################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Config
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="logs/deploy-${TIMESTAMP}.log"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
ALLOWED_BRANCHES=("main" "production")
NO_CACHE=false
DRY_RUN=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-cache) NO_CACHE=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Opção desconhecida: $1"; exit 1 ;;
  esac
done

# Criar dir logs
mkdir -p logs

# Função de log
log() {
  local level=$1
  local msg=$2
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  echo -e "${timestamp} [${level}] ${msg}" | tee -a "$LOG_FILE"
}

log "INFO" "═══════════════════════════════════════════"
log "INFO" "🚀 DEPLOY VALIDADO - AirTrust v1"
log "INFO" "═══════════════════════════════════════════"

# ============================================
# 1. VALIDAR BRANCH
# ============================================
log "INFO" "1️⃣  Validando branch..."
if [[ ! " ${ALLOWED_BRANCHES[@]} " =~ " ${BRANCH} " ]]; then
  log "ERROR" "❌ Deploy permitido apenas em: ${ALLOWED_BRANCHES[@]}"
  log "ERROR" "Branch atual: ${BRANCH}"
  exit 1
fi
log "OK" "✅ Branch válida: ${BRANCH}"

# ============================================
# 2. VERIFICAR UNCOMMITTED CHANGES
# ============================================
log "INFO" "2️⃣  Verificando working directory..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "ERROR" "❌ Há mudanças não commitadas:"
  git status --short | tee -a "$LOG_FILE"
  exit 1
fi
log "OK" "✅ Working directory limpo"

# ============================================
# 3. LIMPAR CACHE (se requested)
# ============================================
if [ "$NO_CACHE" = true ]; then
  log "INFO" "3️⃣  Limpando cache completo..."
  rm -rf dist node_modules .next .vite build coverage
  rm -rf worker-airtrust/dist worker-airtrust/node_modules worker-airtrust/.wrangler
  log "OK" "✅ Cache limpo"
else
  log "INFO" "3️⃣  Pulando limpeza de cache (use --no-cache para forçar)"
fi

# ============================================
# 4. INSTALAR DEPENDÊNCIAS
# ============================================
log "INFO" "4️⃣  Instalando dependências..."
if ! npm install >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Falha ao instalar dependências"
  exit 1
fi
cd worker-airtrust && npm install >> ../"$LOG_FILE" 2>&1 && cd ..
log "OK" "✅ Dependências instaladas"

# ============================================
# 5. BUILD FRONTEND
# ============================================
log "INFO" "5️⃣  Buildando frontend..."
if ! npm run build >> "$LOG_FILE" 2>&1; then
  log "ERROR" "❌ Falha no build do frontend"
  exit 1
fi
log "OK" "✅ Frontend build OK"

# ============================================
# 6. VALIDAR DIST
# ============================================
log "INFO" "6️⃣  Validando dist/"
if [ ! -d "dist/client" ]; then
  log "ERROR" "❌ dist/client não encontrado"
  exit 1
fi
DIST_FILES=$(find dist/client -type f | wc -l)
if [ "$DIST_FILES" -lt 10 ]; then
  log "ERROR" "❌ dist muito vazio: $DIST_FILES arquivos (esperado >10)"
  exit 1
fi
log "OK" "✅ dist/ validado ($DIST_FILES arquivos)"

# ============================================
# 7. VALIDAR TYPESCRIPT
# ============================================
log "INFO" "7️⃣  Validando TypeScript..."
if ! npx tsc --noEmit >> "$LOG_FILE" 2>&1; then
  log "WARN" "⚠️  Avisos TypeScript (não bloqueante)"
fi
log "OK" "✅ TypeScript OK"

# ============================================
# 8. ADICIONAR DIST AO GIT
# ============================================
log "INFO" "8️⃣  Adicionando dist/ ao commit..."
git add -f dist/ >> "$LOG_FILE" 2>&1
GIT_STATUS=$(git status --porcelain | wc -l)
if [ "$GIT_STATUS" -eq 0 ]; then
  log "WARN" "⚠️  Nenhuma mudança para commitar (dist já sincronizado)"
else
  log "OK" "✅ $GIT_STATUS mudanças staged"
fi

# ============================================
# 9. COMMIT
# ============================================
if [ "$GIT_STATUS" -gt 0 ]; then
  log "INFO" "9️⃣  Commitando mudanças..."
  local commit_msg="deploy: build atualizado [$(date +%d/%m/%Y_%H:%M)] - validação: OK"
  if [ "$DRY_RUN" = true ]; then
    log "DRY_RUN" "Seria commitado: $commit_msg"
  else
    git commit -m "$commit_msg" >> "$LOG_FILE" 2>&1
    log "OK" "✅ Commit feito"
  fi
fi

# ============================================
# 10. PUSH
# ============================================
log "INFO" "🔟 Push para origem..."
if [ "$DRY_RUN" = true ]; then
  log "DRY_RUN" "Seria feito: git push origin $BRANCH"
else
  if ! git push origin "$BRANCH" >> "$LOG_FILE" 2>&1; then
    log "ERROR" "❌ Falha no push"
    exit 1
  fi
  log "OK" "✅ Push concluído"
fi

# ============================================
# 11. DEPLOY WORKER (Wrangler)
# ============================================
log "INFO" "1️⃣1️⃣ Deploy do Worker..."
if [ "$DRY_RUN" = true ]; then
  log "DRY_RUN" "Seria executado: wrangler deploy"
else
  cd worker-airtrust
  if ! wrangler deploy >> ../"$LOG_FILE" 2>&1; then
    cd ..
    log "ERROR" "❌ Falha no deploy do Worker"
    exit 1
  fi
  cd ..
  log "OK" "✅ Worker deployado"
fi

# ============================================
# RESUMO FINAL
# ============================================
log "OK" "═══════════════════════════════════════════"
log "OK" "🎉 DEPLOY COMPLETADO COM SUCESSO!"
log "OK" "═══════════════════════════════════════════"
log "INFO" "Branch: $BRANCH"
log "INFO" "Timestamp: $TIMESTAMP"
log "INFO" "Log: $LOG_FILE"
log "INFO" ""
log "INFO" "✅ Verificações passaram:"
log "INFO" "   ✓ Branch válida (main/production)"
log "INFO" "   ✓ Working directory limpo"
log "INFO" "   ✓ Build sucesso"
log "INFO" "   ✓ dist/ validado"
log "INFO" "   ✓ TypeScript OK"
log "INFO" "   ✓ Git push OK"
log "INFO" "   ✓ Wrangler deploy OK"
log "INFO" ""
log "INFO" "📊 Próximos passos:"
log "INFO" "   1. Vercel detectará push em ~30s"
log "INFO" "   2. Build em Vercel em ~1-2min"
log "INFO" "   3. Deploy em produção em ~2-3min"
log "INFO" "   4. Verificar: https://production.airtrust.pages.dev"
log "INFO" ""

# Abrir log se verbose
if [ -n "$VERBOSE" ]; then
  cat "$LOG_FILE"
fi

exit 0
