#!/usr/bin/env bash
# check-stale-dist.sh
# Verifica se dist/client/ está desatualizado em relação aos fontes.
# Exit 0 = dist OK  |  Exit 1 = dist STALE ou ausente

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

DIST_FILE="$ROOT/dist/client/index.html"

# Se dist não existe → stale
if [[ ! -f "$DIST_FILE" ]]; then
  echo "⚠️  [STALE CHECK] dist/client/ NÃO EXISTE — rebuild necessário." >&2
  exit 1
fi

DIST_MTIME=$(stat -f "%m" "$DIST_FILE" 2>/dev/null || stat -c "%Y" "$DIST_FILE")

# Encontra o arquivo-fonte mais novo em src/ ou worker-airtrust/src/
NEWEST_SRC=$(find "$ROOT/src" "$ROOT/worker-airtrust/src" -name "*.ts" -o -name "*.tsx" -o -name "*.css" 2>/dev/null \
  | xargs stat -f "%m %N" 2>/dev/null | sort -rn | head -1 | awk '{print $1}')

if [[ -z "$NEWEST_SRC" ]]; then
  echo "✅ [STALE CHECK] Nenhum arquivo fonte encontrado — assumindo dist OK."
  exit 0
fi

if [[ "$NEWEST_SRC" -gt "$DIST_MTIME" ]]; then
  DIST_DATE=$(date -r "$DIST_FILE" "+%Y-%m-%d %H:%M:%S")
  SRC_DATE=$(date -r "$(
    find "$ROOT/src" "$ROOT/worker-airtrust/src" -name "*.ts" -o -name "*.tsx" -o -name "*.css" 2>/dev/null \
    | xargs stat -f "%m %N" 2>/dev/null | sort -rn | head -1 | awk '{print $2}'
  )" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "?")
  echo "⛔  [STALE CHECK] dist/ DESATUALIZADO!" >&2
  echo "    dist construído em: $DIST_DATE" >&2
  echo "    fonte mais novo em: $SRC_DATE" >&2
  echo "    → Execute: npm run build" >&2
  exit 1
fi

echo "✅ [STALE CHECK] dist/ está atualizado."
exit 0
