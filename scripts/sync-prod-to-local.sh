#!/usr/bin/env bash
set -euo pipefail

# Sync produção → local (D1) para as tabelas canônicas
# funcionarios, qualificacoes_tipos, qualificacoes_historico
# Requisitos: wrangler, jq

: "${DB_PROD:=airtrust-db}"
: "${DB_LOCAL:=airtrust-db}"
: "${REMOTE:=1}"

if ! command -v wrangler >/dev/null 2>&1; then
  echo "❌ wrangler não encontrado" >&2; exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq não encontrado" >&2; exit 1
fi

REMOTE_FLAG=""
if [ "$REMOTE" = "1" ]; then
  REMOTE_FLAG="--remote"
fi

WORKDIR="sync-data"
mkdir -p "$WORKDIR"

FUNC_COLS='["id","nome","nome_guerra","cpf","matricula","email","telefone","funcao","cargo","setor","codigo_anac","status","ativo","is_instrutor","is_checador","data_admissao","created_at","updated_at","deleted_at"]'
QTIPOS_COLS='["id","nome","codigo","categoria","descricao","validade_meses","ativo","created_at","updated_at","deleted_at"]'
QHIST_COLS='["id","funcionario_id","qualificacao_id","data_conclusao","data_vencimento","validade_meses","codigo","categoria","numero_certificado","observacoes","arquivo_url","nota","instrutor","local","modalidade","carga_horaria","status","created_at","updated_at","deleted_at"]'

sql_from_json() {
  local table="$1" cols_json="$2" json_file="$3" out_file="$4"
  local jqfile
  jqfile=$(mktemp)
  cat > "$jqfile" <<'JQ'
def sqlv:
  if .==null then
    "NULL"
  elif (type=="number") then
    tostring
  elif (type=="boolean") then
    (if . then "1" else "0" end)
  else
    "'" + (tostring | gsub("'"; "''")) + "'"
  end;
"BEGIN TRANSACTION;" ,
( .[] | "INSERT OR REPLACE INTO " + $table + " (" + ($cols | join(",")) + ") VALUES (" + ( [ .[ $cols[] ] | sqlv ] | join(",") ) + ");" ),
"COMMIT;"
JQ
  jq -r --arg table "$table" --argjson cols "$cols_json" -f "$jqfile" "$json_file" > "$out_file"
  rm -f "$jqfile"
}

fetch_json() {
  local table="$1" json_out="$2" select_sql="$3"
  echo "📥 Exportando produção: $table"
  wrangler d1 execute "$DB_PROD" $REMOTE_FLAG --command "$select_sql" --json 2>/dev/null \
    | jq -r '.[0].results' > "$json_out"
}

apply_sql_local() {
  local table="$1" sql_file="$2"
  echo "🧹 Limpando tabela local: $table"
  wrangler d1 execute "$DB_LOCAL" --command "DELETE FROM $table; DELETE FROM sqlite_sequence WHERE name='$table';" >/dev/null
  echo "⬇️  Importando para local: $table"
  wrangler d1 execute "$DB_LOCAL" --file "$sql_file" >/dev/null
}

echo "🔄 Sincronizando funcionarios, qualificacoes_tipos, qualificacoes_historico (produção → local)"

# 1) funcionarios
fetch_json "funcionarios" "$WORKDIR/funcionarios.json" "SELECT * FROM funcionarios;"
sql_from_json "funcionarios" "$FUNC_COLS" "$WORKDIR/funcionarios.json" "$WORKDIR/funcionarios.sql"
apply_sql_local "funcionarios" "$WORKDIR/funcionarios.sql"

# 2) qualificacoes_tipos
fetch_json "qualificacoes_tipos" "$WORKDIR/qualificacoes_tipos.json" "SELECT * FROM qualificacoes_tipos;"
sql_from_json "qualificacoes_tipos" "$QTIPOS_COLS" "$WORKDIR/qualificacoes_tipos.json" "$WORKDIR/qualificacoes_tipos.sql"
apply_sql_local "qualificacoes_tipos" "$WORKDIR/qualificacoes_tipos.sql"

# 3) qualificacoes_historico (por último)
fetch_json "qualificacoes_historico" "$WORKDIR/qualificacoes_historico.json" "SELECT * FROM qualificacoes_historico;"
sql_from_json "qualificacoes_historico" "$QHIST_COLS" "$WORKDIR/qualificacoes_historico.json" "$WORKDIR/qualificacoes_historico.sql"
apply_sql_local "qualificacoes_historico" "$WORKDIR/qualificacoes_historico.sql"

echo "✅ Concluído. Revise as telas em http://localhost:3000"
