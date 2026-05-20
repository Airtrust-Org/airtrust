#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Iniciando preparação de schema local (certificados + qualificações)"

DB_BINDINGS=("airtrust-db-dev")
CONFIG_FLAG="--local"
WRANGLER_CONFIG_DEV="--config wrangler.dev.toml"

run_sql() {
  local binding="$1"; shift
  local sql="$1"; shift || true
  npx wrangler d1 execute $WRANGLER_CONFIG_DEV "$binding" $CONFIG_FLAG --command "$sql" >/dev/null 2>&1 || true
}

ensure_table() {
  local binding="$1"; shift
  local table="$1"; shift
  local create_sql="$1"; shift
  local exists
  exists=$(npx wrangler d1 execute $WRANGLER_CONFIG_DEV "$binding" $CONFIG_FLAG --command "SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'" 2>/dev/null | grep -c "$table" || true)
  if [ "$exists" -eq 0 ]; then
    echo "🧱 Criando tabela '$table' em $binding"
    run_sql "$binding" "$create_sql"
  else
    echo "✅ Tabela '$table' já existe em $binding"
  fi
}

for binding in "${DB_BINDINGS[@]}"; do
  echo "\n=== Binding: $binding ==="

  ensure_table "$binding" "funcionarios" "CREATE TABLE IF NOT EXISTS funcionarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, matricula TEXT, email TEXT, cargo TEXT, deleted_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));"

  ensure_table "$binding" "qualificacoes_tipos" "CREATE TABLE IF NOT EXISTS qualificacoes_tipos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, codigo TEXT, categoria TEXT, descricao TEXT, validade_meses INTEGER, ativo INTEGER DEFAULT 1, deleted_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));"

  ensure_table "$binding" "qualificacoes_historico" "CREATE TABLE IF NOT EXISTS qualificacoes_historico (id INTEGER PRIMARY KEY AUTOINCREMENT, funcionario_id INTEGER, qualificacao_id INTEGER, data_conclusao TEXT, data_vencimento TEXT, numero_certificado TEXT, observacoes TEXT, tipo_codigo TEXT, categoria TEXT, arquivo_url TEXT, nota TEXT, instrutor TEXT, local TEXT, carga_horaria INTEGER, modalidade TEXT, renovacao_de INTEGER, deleted_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));"

  ensure_table "$binding" "certificados" "CREATE TABLE IF NOT EXISTS certificados (id INTEGER PRIMARY KEY AUTOINCREMENT, qualificacao_historico_id INTEGER, funcionario_id INTEGER, nome_arquivo TEXT, url TEXT, tipo TEXT, tamanho INTEGER, descricao TEXT, deleted_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));"

  echo "🔍 Verificando registros seed básicos"
  count_func=$(npx wrangler d1 execute $WRANGLER_CONFIG_DEV "$binding" $CONFIG_FLAG --command "SELECT COUNT(*) as c FROM funcionarios" 2>/dev/null | grep -Eo '[0-9]+' | head -1 || echo 0)
  if [ "${count_func:-0}" -eq 0 ]; then
    echo "🌱 Inserindo funcionário seed"
    run_sql "$binding" "INSERT INTO funcionarios (nome, matricula, email, cargo) VALUES ('Funcionario Demo', 'MAT001', 'demo@local', 'Analista');"
  fi

  count_tipo=$(npx wrangler d1 execute $WRANGLER_CONFIG_DEV "$binding" $CONFIG_FLAG --command "SELECT COUNT(*) as c FROM qualificacoes_tipos" 2>/dev/null | grep -Eo '[0-9]+' | head -1 || echo 0)
  if [ "${count_tipo:-0}" -eq 0 ]; then
    echo "🌱 Inserindo tipo qualificação seed"
    run_sql "$binding" "INSERT INTO qualificacoes_tipos (nome, codigo, categoria, descricao, validade_meses, ativo) VALUES ('Treinamento Segurança', 'SEG-BASE', 'SEGURANCA', 'Curso base de segurança', 12, 1);"
  fi

  count_hist=$(npx wrangler d1 execute $WRANGLER_CONFIG_DEV "$binding" $CONFIG_FLAG --command "SELECT COUNT(*) as c FROM qualificacoes_historico" 2>/dev/null | grep -Eo '[0-9]+' | head -1 || echo 0)
  if [ "${count_hist:-0}" -eq 0 ]; then
    echo "🌱 Inserindo histórico seed"
    run_sql "$binding" "INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, tipo_codigo, categoria) VALUES (1, 1, '2025-01-10', '2025-12-31', 'SEG-BASE', 'SEGURANCA');"
  fi

  echo "📊 Resumo ($binding):"
  npx wrangler d1 execute $WRANGLER_CONFIG_DEV "$binding" $CONFIG_FLAG --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null | sed 's/^/   • /'

done

echo "✅ Schema local preparado."
