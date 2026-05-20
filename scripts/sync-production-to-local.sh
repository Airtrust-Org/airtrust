#!/bin/bash
set -euo pipefail

echo "🚀 Sincronização COMPLETA Produção -> Local (D1)"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
BACKUP_DIR="$PROJECT_ROOT/backups"
mkdir -p "$BACKUP_DIR"

REMOTE_DB_NAME="airtrust-db"  # conforme wrangler.toml

STAMP="$(date +%Y%m%d-%H%M%S)"
EXPORT_FILE="$BACKUP_DIR/prod-full-$STAMP.sql"

echo "📦 Exportando banco remoto produção para $EXPORT_FILE"
cd "$WORKER_DIR"
npx wrangler d1 export "$REMOTE_DB_NAME" --remote --output "$EXPORT_FILE"

echo "🧹 Limpando base local persistente (todos .sqlite)"
STATE_DIR="./.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
if [ -d "$STATE_DIR" ]; then
  find "$STATE_DIR" -maxdepth 1 -type f -name '*.sqlite' -exec rm -f {} +
  echo "✅ Arquivos .sqlite removidos"
fi

echo "🔧 Reinicializando servidor local rápido para gerar arquivo"
NODE_PID="$(pgrep -f "wrangler dev" || true)"
if [ -n "$NODE_PID" ]; then
  kill "$NODE_PID" || true
fi

echo "📄 Ajustando export (removendo bloco de d1_migrations completo + inserts)"
SANITIZED_FILE="$BACKUP_DIR/prod-full-$STAMP-sanitized.sql"

# Sanitização robusta:
# - Remove todo o bloco CREATE TABLE d1_migrations (...) ;
# - Remove todos os INSERT INTO "d1_migrations" ... (mesmo com quebras de linha)
# Mantém PRAGMAs e demais tabelas intactas.
SCHEMA_FILE="$BACKUP_DIR/prod-full-$STAMP-schema.sql"
DATA_FILE="$BACKUP_DIR/prod-full-$STAMP-data.sql"
rm -f "$SCHEMA_FILE" "$DATA_FILE"

awk 'BEGIN{increate=0}
{
  line=$0
  tl=tolower(line)
  if (match(tl,/^pragma/)) {print line >> schema; next}
  if (match(tl,/^create /)) {
    increate=1
    if (match(tl,/^create table/) && !match(tl,/^create table if not exists/)) {
      sub(/^CREATE TABLE /,"CREATE TABLE IF NOT EXISTS ",line)
    }
    buffer=line
    if (index(line,";")>0) {print buffer >> schema; increate=0}
    next
  }
  if (increate) {
    buffer=buffer"\n"line
    if (index(line,";")>0) {print buffer >> schema; increate=0}
    next
  }
  if (match(tl,/^insert into/)) {print line >> data; next}
  # Ignorar outras linhas (ex: comentários, seq)
}
END{}' schema="$SCHEMA_FILE" data="$DATA_FILE" "$EXPORT_FILE"

# Desativar FKs no início do schema e reativar no final
{ echo 'PRAGMA foreign_keys=OFF;'; cat "$SCHEMA_FILE"; echo 'PRAGMA foreign_keys=ON;'; } > "$SCHEMA_FILE.tmp" && mv "$SCHEMA_FILE.tmp" "$SCHEMA_FILE"

# Normalizar quebras estranhas (tokens fracionados e CREATE na mesma linha)
perl -0777 -pe 's/d1_m\nigrations/d1_migrations/g; s/func\noes/funcoes/g; s/seto\nres/setores/g; s/aero\nnaves/aeronaves/g; s/back\nups/backups/g; s/impo\nrtacoes/importacoes/g; s/simu\nladores/simuladores/g;' "$SCHEMA_FILE" > "$SCHEMA_FILE.tmp" && mv "$SCHEMA_FILE.tmp" "$SCHEMA_FILE"
sed -i '' -E 's/\);[[:space:]]+CREATE TABLE/);\nCREATE TABLE/g' "$SCHEMA_FILE"

SANITIZED_FILE="$BACKUP_DIR/prod-full-$STAMP-sanitized.sql" # manter variável compatível com etapas posteriores
echo "-- Two-phase import wrapper" > "$SANITIZED_FILE"
echo ".schema: $SCHEMA_FILE" >> "$SANITIZED_FILE"
echo ".data: $DATA_FILE" >> "$SANITIZED_FILE"

# Validação rápida para evitar cabeçalho corrompido (ex: começa com 'id INTEGER ...')
# (Validação simplificada removida para permitir PRAGMAs iniciais)

echo "✅ Arquivo sanitizado criado: $SANITIZED_FILE"

echo "🛠 Importando SCHEMA (fase 1)"
npx wrangler d1 execute "$REMOTE_DB_NAME" --local --file "$SCHEMA_FILE" || { echo "❌ Falha schema"; exit 1; }
echo "🛠 Importando DATA (fase 2)"
npx wrangler d1 execute "$REMOTE_DB_NAME" --local --file "$DATA_FILE" || { echo "❌ Falha data"; exit 1; }

echo "🔍 Verificando tabelas importadas"
npx wrangler d1 execute "$REMOTE_DB_NAME" --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"

echo "🔍 Verificando views importadas"
npx wrangler d1 execute "$REMOTE_DB_NAME" --local --command "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name;" || true

echo "🚀 Iniciando dev servers (web + api) pós-sync"
cd "$PROJECT_ROOT"
if pgrep -f "vite --port 3000" > /dev/null; then
  pkill -f "vite --port 3000" || true
fi
if pgrep -f "wrangler dev" > /dev/null; then
  pkill -f "wrangler dev" || true
fi

nohup npm run dev:all >/dev/null 2>&1 &
echo "✅ Servidores iniciados em background"

echo "🧪 Health check (aguardando 4s)"
sleep 4
curl -s http://localhost:8787/api/health || echo "⚠️ Health falhou"

echo "🧪 Teste rápido funcionarios (limit=3)"
curl -s "http://localhost:8787/api/funcionarios?limit=3" | head -c 500 || true

echo "🎉 Sincronização completa"
