#!/usr/bin/env bash
set -euo pipefail

# Exporta registros da tabela qualificacoes_historico local para arquivo SQL para carga na produção.
# Gera INSERT OR IGNORE para evitar colisões se já existirem IDs.
# Saída: exports/qualificacoes_historico_production_load.sql

DB_PATH=".wrangler/state/v3/d1/miniflare-D1DatabaseObject/db.sqlite"
OUT_DIR="exports"
OUT_FILE="$OUT_DIR/qualificacoes_historico_production_load.sql"

if [ ! -f "$DB_PATH" ]; then
  echo "❌ Banco local não encontrado em $DB_PATH" >&2
  exit 1
fi
mkdir -p "$OUT_DIR"

TOTAL_LOCAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL")

TMP_FILE="$(mktemp)"
sqlite3 "$DB_PATH" <<EOF
.output $TMP_FILE
.mode insert qualificacoes_historico
SELECT * FROM qualificacoes_historico WHERE deleted_at IS NULL;
EOF

# Converter qualquer variante de INSERT INTO qualificacoes_historico para INSERT OR IGNORE INTO qualificacoes_historico
# Cobre casos com ou sem aspas.
sed -i '' -E 's/^INSERT INTO "?qualificacoes_historico"?/INSERT OR IGNORE INTO qualificacoes_historico/' "$TMP_FILE"

{
  echo "BEGIN TRANSACTION;"
  echo "-- IMPORT DATA FOR qualificacoes_historico (generated $(date -u +%Y-%m-%dT%H:%M:%SZ))"
  echo "-- Total local: $TOTAL_LOCAL"
  echo "-- Inserções geradas via .mode insert (convertidas para OR IGNORE)"
  cat "$TMP_FILE"
  echo "COMMIT;"
} > "$OUT_FILE"

rm -f "$TMP_FILE"

LINE_COUNT=$(wc -l < "$OUT_FILE")
echo "✅ Export concluído: $OUT_FILE ($LINE_COUNT linhas)"
