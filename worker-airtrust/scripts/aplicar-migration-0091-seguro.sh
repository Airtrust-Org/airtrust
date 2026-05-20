#!/usr/bin/env bash
set -euo pipefail

# aplicar-migration-0091-seguro.sh
# Aplica migration 0091 somente se diversidade do backup justificar.
# Critérios:
#   - Tabela _backup_qualificacoes_historico existe
#   - Backup possui diversidade (>2 categorias OU >2 tipo_codigo/codigo distintos)
#   - Atual possui baixa diversidade (<=2 em todas as dimensões)
# Se não cumprir, aborta sem efeito.

DB_NAME=${1:-"airtrust-db"}

function run() {
  wrangler d1 execute "$DB_NAME" --remote --command "$1"
}

echo "[INFO] Coletando métricas..."
CURRENT_JSON=$(run "SELECT json_object('ccat',COUNT(DISTINCT categoria),'ctip',COUNT(DISTINCT tipo_codigo),'ccod',COUNT(DISTINCT codigo)) AS j FROM qualificacoes_historico WHERE deleted_at IS NULL;")
BACKUP_PRESENT=$(run "SELECT CASE WHEN EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='_backup_qualificacoes_historico') THEN 1 ELSE 0 END AS present;")
BACKUP_JSON=$(run "SELECT json_object('bcat',COUNT(DISTINCT categoria),'btip',COUNT(DISTINCT tipo_codigo),'bcod',COUNT(DISTINCT codigo)) AS j FROM _backup_qualificacoes_historico;" || echo '{"j":"{}"}')

echo "[DEBUG] CURRENT_JSON=$CURRENT_JSON"
echo "[DEBUG] BACKUP_PRESENT=$BACKUP_PRESENT"
echo "[DEBUG] BACKUP_JSON=$BACKUP_JSON"

# Extrair números (simplificado via grep)
ccat=$(echo "$CURRENT_JSON" | grep -Eo '"ccat":[0-9]+' | grep -Eo '[0-9]+') || ccat=0
ctip=$(echo "$CURRENT_JSON" | grep -Eo '"ctip":[0-9]+' | grep -Eo '[0-9]+') || ctip=0
ccod=$(echo "$CURRENT_JSON" | grep -Eo '"ccod":[0-9]+' | grep -Eo '[0-9]+') || ccod=0
present=$(echo "$BACKUP_PRESENT" | grep -Eo '[0-9]+') || present=0
bcat=$(echo "$BACKUP_JSON" | grep -Eo '"bcat":[0-9]+' | grep -Eo '[0-9]+') || bcat=0
btip=$(echo "$BACKUP_JSON" | grep -Eo '"btip":[0-9]+' | grep -Eo '[0-9]+') || btip=0
bcod=$(echo "$BACKUP_JSON" | grep -Eo '"bcod":[0-9]+' | grep -Eo '[0-9]+') || bcod=0

echo "[INFO] Atual: categorias=$ccat tipo_codigo=$ctip codigos=$ccod"
echo "[INFO] Backup: categorias=$bcat tipo_codigo=$btip codigos=$bcod (present=$present)"

if [ "$present" != "1" ]; then
  echo "[ABORT] Backup inexistente. Nada a aplicar."
  exit 0
fi

LOW_DIVERSITY=$([ $ccat -le 2 ] && [ $ctip -le 2 ] && [ $ccod -le 2 ] && echo 1 || echo 0)
BACKUP_DIVERSE=$([ $bcat -gt $ccat ] || [ $btip -gt $ctip ] || [ $bcod -gt $ccod ] && echo 1 || echo 0)

if [ "$LOW_DIVERSITY" = "1" ] && [ "$BACKUP_DIVERSE" = "1" ]; then
  echo "[APPLY] Critérios atendidos. Aplicando migration 0091..."
  wrangler d1 migrations apply "$DB_NAME" --remote --migration 0091
  echo "[DONE] Migration 0091 aplicada."
else
  echo "[SKIP] Critérios não atendidos (LOW_DIVERSITY=$LOW_DIVERSITY BACKUP_DIVERSE=$BACKUP_DIVERSE). Não há ganho."
fi

exit 0