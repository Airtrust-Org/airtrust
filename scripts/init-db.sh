#!/bin/bash

# Script de inicialização do banco de dados D1
# Aplica todas as migrations necessárias na ordem correta

echo "🗄️  Inicializando banco de dados AirTrust..."

DB_PATH=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
DB_FILE=$(find $DB_PATH -name "*.sqlite" 2>/dev/null | head -1)

if [ -z "$DB_FILE" ]; then
  echo "❌ Banco de dados não encontrado. Inicie o worker primeiro."
  exit 1
fi

echo "📍 Banco encontrado: $DB_FILE"

# Tabelas essenciais na ordem correta
echo ""
echo "📋 Criando tabelas essenciais..."

# 1. Funcionários
echo "  → funcionarios"
sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  matricula TEXT UNIQUE,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  data_nascimento TEXT,
  data_admissao TEXT,
  guerra TEXT,
  cargo TEXT,
  funcao TEXT,
  setor TEXT,
  base TEXT,
  contrato TEXT,
  status TEXT DEFAULT 'ATIVO',
  codigo_anac TEXT,
  codigo_canac TEXT,
  codigo_sispat TEXT,
  codigo_prestserv TEXT,
  licenca_aeronautica TEXT,
  anv TEXT,
  aeronave_principal TEXT,
  cma_numero TEXT,
  cma_data_vencimento TEXT,
  cma_status TEXT,
  aso_data_vencimento TEXT,
  nivel_icao TEXT,
  nivel_icao_data_vencimento TEXT,
  nivel_icao_status TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);"

# 2. Certificações
echo "  → certificacoes_v3"
sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS certificacoes_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT,
  validade_meses INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);"

# 3. Histórico de Certificações
echo "  → historicocertificacoesv2"
sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS historicocertificacoesv2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  certificacao_id INTEGER NOT NULL,
  data_conclusao TEXT,
  validade TEXT,
  instrutor TEXT,
  nota_final REAL,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (certificacao_id) REFERENCES certificacoes_v3(id)
);"

# 4. Exames
echo "  → exames"
sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS exames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_exame TEXT NOT NULL,
  data_exame TEXT NOT NULL,
  validade TEXT,
  resultado TEXT,
  medico TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);"

# 5. Checks
echo "  → checks"
sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_check TEXT NOT NULL,
  data_check TEXT NOT NULL,
  validade TEXT,
  aprovado INTEGER DEFAULT 0,
  instrutor TEXT,
  observacoes TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);"

# 6. Log de Importações
echo "  → importacoes_log"
sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS importacoes_log (
  id TEXT PRIMARY KEY,
  tipo_importacao TEXT NOT NULL,
  usuario_id TEXT,
  usuario_nome TEXT,
  arquivo_nome TEXT NOT NULL,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  linhas_sucesso INTEGER NOT NULL DEFAULT 0,
  linhas_erro INTEGER NOT NULL DEFAULT 0,
  tempo_processamento_ms INTEGER NOT NULL DEFAULT 0,
  detalhes_erros TEXT,
  status TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'WEB',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);"

# Índices
echo ""
echo "📊 Criando índices..."
sqlite3 "$DB_FILE" "
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_certificacoes_codigo ON certificacoes_v3(codigo);
CREATE INDEX IF NOT EXISTS idx_historico_funcionario ON historicocertificacoesv2(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_historico_certificacao ON historicocertificacoesv2(certificacao_id);
CREATE INDEX IF NOT EXISTS idx_exames_funcionario ON exames(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_checks_funcionario ON checks(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_importacoes_tipo ON importacoes_log(tipo_importacao);
"

# Verificar
echo ""
echo "✅ Verificando tabelas criadas..."
sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" | while read table; do
  count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table;")
  echo "  ✓ $table ($count registros)"
done

echo ""
echo "🎉 Banco de dados inicializado com sucesso!"
