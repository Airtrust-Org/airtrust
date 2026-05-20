#!/bin/bash
# =============================================================
# setup_local_dev_mirror.sh
# Cria espelho LOCAL do banco de produção (airtrust-db) para dev rápido
# Stack: Cloudflare D1 (wrangler) - Executar na raiz do repo
# =============================================================
set -euo pipefail

COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${COLOR_GREEN}[OK]${NC} $1"; }
info() { echo -e "${COLOR_BLUE}[INFO]${NC} $1"; }
warn() { echo -e "${COLOR_YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${COLOR_RED}[ERR]${NC} $1"; }

REMOTE_DB_NAME="airtrust-db"
LOCAL_DB_NAME="airtrust-db-local"
BACKUP_FILE="prod_backup_$(date +%Y%m%d_%H%M%S).sql"
WRANGLER_FILE="worker-airtrust/wrangler.toml"
PERSIST_PATH="./.wrangler/state/v3/d1/airtrust-mirror.sqlite"

# Resolver caminho real do wrangler.toml independente do diretório atual
if [ ! -f "${WRANGLER_FILE}" ]; then
  if [ -f "wrangler.toml" ]; then
    WRANGLER_FILE="wrangler.toml"
  elif [ -f "../worker-airtrust/wrangler.toml" ]; then
    WRANGLER_FILE="../worker-airtrust/wrangler.toml"
  elif [ -f "../wrangler.toml" ]; then
    WRANGLER_FILE="../wrangler.toml"
  fi
fi

if [ ! -f "${WRANGLER_FILE}" ]; then
  err "Não encontrado wrangler.toml (tentado: worker-airtrust/wrangler.toml, wrangler.toml, ../worker-airtrust/wrangler.toml)"
  exit 1
fi

info "Verificando instalação do wrangler..."
if ! command -v wrangler >/dev/null 2>&1; then
  err "wrangler não encontrado. Instale com: npm i -g wrangler"
  exit 1
fi

info "Exportando banco remoto produção -> ${BACKUP_FILE}"
wrangler d1 export "${REMOTE_DB_NAME}" --remote --output "${BACKUP_FILE}"
log "Export concluída: ${BACKUP_FILE}"

info "Listando bancos existentes locais..."
EXISTS_LOCAL=$(wrangler d1 list | grep -c "${LOCAL_DB_NAME}" || true)

if [ "${EXISTS_LOCAL}" -eq 0 ]; then
  info "Criando banco local ${LOCAL_DB_NAME}"
  wrangler d1 create "${LOCAL_DB_NAME}" >/dev/null 2>&1 || true
  log "Banco local criado"
else
  warn "Banco ${LOCAL_DB_NAME} já existe (reutilizando)"
fi

info "Obtendo ID do banco local..."
LOCAL_DB_ID=$(wrangler d1 list | awk -v name="${LOCAL_DB_NAME}" 'tolower($0) ~ tolower(name) {print $2}' | head -1)
if [ -z "${LOCAL_DB_ID}" ]; then
  err "Não foi possível obter ID do banco local"
  exit 1
fi
log "ID local: ${LOCAL_DB_ID}"

info "Registrando banco local no wrangler.toml (mapping raiz se necessário)..."
if ! grep -q "${LOCAL_DB_NAME}" "${WRANGLER_FILE}"; then
  cat >> "${WRANGLER_FILE}" <<EOF

[[d1_databases]]
binding = "DB_MIRROR"
database_name = "${LOCAL_DB_NAME}"
database_id = "${LOCAL_DB_ID}"
preview_database_id = "${LOCAL_DB_ID}"
migrations_dir = "./migrations"
EOF
  log "Mapping raiz DB_MIRROR adicionado"
else
  warn "Mapping para ${LOCAL_DB_NAME} já existe"
fi

info "Garantindo bloco env.localmirror antes da importação..."
if ! grep -q "\[env.localmirror\]" "${WRANGLER_FILE}"; then
  cat >> "${WRANGLER_FILE}" <<EOF

[env.localmirror]
name = "airtrust-api-localmirror"

[[env.localmirror.d1_databases]]
binding = "DB"
database_name = "${LOCAL_DB_NAME}"
database_id = "${LOCAL_DB_ID}"
preview_database_id = "${LOCAL_DB_ID}"
migrations_dir = "./migrations"

[[env.localmirror.d1_databases.persistence]]
path = "${PERSIST_PATH}"

[env.localmirror.vars]
ENVIRONMENT = "local-mirror"
USE_QUALIFICACOES_VIEW = "true"
DEV_AUTH_BYPASS = "true"
EOF
  log "Bloco env.localmirror criado"
else
  warn "env.localmirror já existe"
fi

info "Importando dump no banco local (tentativa via wrangler)..."
IMPORT_FALLBACK=0
if wrangler d1 execute "${LOCAL_DB_NAME}" --file "${BACKUP_FILE}" --local >/dev/null 2>&1; then
  log "Importação concluída via wrangler"
else
  warn "Wrangler falhou na importação - iniciando fallback sqlite3 direto"
  IMPORT_FALLBACK=1
  if ! command -v sqlite3 >/dev/null 2>&1; then
    err "sqlite3 não encontrado para fallback"
    exit 1
  fi
  mkdir -p "$(dirname "${PERSIST_PATH}")"
  : > "${PERSIST_PATH}" # cria/zera arquivo
  if sqlite3 "${PERSIST_PATH}" < "${BACKUP_FILE}"; then
    log "Importação concluída via sqlite3 (fallback)"
  else
    err "Fallback sqlite3 falhou"
    exit 1
  fi
fi

info "Validando contagem de registros (qualificacoes_historico)..."
if [ "${IMPORT_FALLBACK}" -eq 1 ]; then
  COUNT_LOCAL=$(sqlite3 "${PERSIST_PATH}" "SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL;" 2>/dev/null || echo 0)
else
  COUNT_LOCAL=$(wrangler d1 execute "${LOCAL_DB_NAME}" --local --command "SELECT COUNT(*) as c FROM qualificacoes_historico WHERE deleted_at IS NULL;" 2>/dev/null | grep -Eo '[0-9]+' | tail -1 || echo 0)
fi
COUNT_LOCAL=$(echo "${COUNT_LOCAL}" | tr -dc '0-9')
log "Registros histórico (local): ${COUNT_LOCAL}"

if [ "${COUNT_LOCAL}" -lt 500 ]; then
  warn "Menos de 500 registros importados - verifique se export estava completa."
fi

info "Ambiente localmirror já registrado anteriormente (etapa pré-import)."

info "Resumo final:";
echo "-------------------------------------------"
echo "Dump remoto:           ${BACKUP_FILE}"
echo "DB local nome:         ${LOCAL_DB_NAME}"
echo "DB local id:           ${LOCAL_DB_ID}"
echo "Registros histórico:   ${COUNT_LOCAL}" 
echo "Ambiente wrangler:     localmirror (executar abaixo)"
echo "-------------------------------------------"

cat <<'USAGE'

Para iniciar desenvolvimento usando espelho local:

  cd worker-airtrust
  wrangler dev --env localmirror --local --persist

Endpoint de teste:

  curl http://localhost:8787/api/qualificacoes/historico?limit=5 | jq '.'

Se quiser atualizar o espelho posteriormente:

  ./scripts/setup_local_dev_mirror.sh

USAGE

log "Concluído: Espelho local pronto."