-- Schema essencial sincronizado com produção

-- Tabela funcionarios (com is_instrutor e is_checador)
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  data_nascimento TEXT,
  data_admissao TEXT,
  cargo TEXT,
  setor TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  guerra TEXT,
  codigo_anac TEXT,
  codigo_canac TEXT,
  funcao TEXT,
  base TEXT,
  contrato TEXT,
  licenca_aeronautica TEXT,
  anv TEXT,
  codigo_sispat TEXT,
  codigo_prestserv TEXT,
  cma_numero TEXT,
  cma_data_vencimento TEXT,
  cma_status TEXT,
  aso_data_vencimento TEXT,
  nivel_icao TEXT,
  nivel_icao_data_vencimento TEXT,
  nivel_icao_status TEXT,
  aeronave_principal TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  funcao_id INTEGER,
  setor_id INTEGER
);

-- Tabela empresas
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT,
  logo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela manobras (com ordem)
CREATE TABLE IF NOT EXISTS manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela certificados (com R2)
CREATE TABLE IF NOT EXISTS certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  numero TEXT,
  data_emissao TEXT,
  data_vencimento TEXT,
  arquivo_url TEXT,
  arquivo_r2_key TEXT,
  arquivo_nome TEXT,
  arquivo_tamanho INTEGER,
  uploaded_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela qualificacoes
CREATE TABLE IF NOT EXISTS qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT,
  data_realizado TEXT,
  data_vencimento TEXT,
  status TEXT DEFAULT 'VALIDA',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela treinamentos (com categoria_id)
CREATE TABLE IF NOT EXISTS treinamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  categoria_id INTEGER,
  periodicidade_meses INTEGER,
  status TEXT DEFAULT 'ATIVO',
  instrutor_responsavel TEXT,
  certificacao_relacionada TEXT,
  total_sessoes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela fichas_sessao
CREATE TABLE IF NOT EXISTS fichas_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  empresa_id INTEGER,
  modelo_id INTEGER,
  data_sessao TEXT,
  pdf_url TEXT,
  status TEXT DEFAULT 'PENDENTE',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela funcoes
CREATE TABLE IF NOT EXISTS funcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela setores
CREATE TABLE IF NOT EXISTS setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Inserir dados de teste
INSERT OR IGNORE INTO funcoes (id, nome) VALUES (1, 'Piloto');
INSERT OR IGNORE INTO funcoes (id, nome) VALUES (2, 'Instrutor');
INSERT OR IGNORE INTO funcoes (id, nome) VALUES (3, 'Examinador');

INSERT OR IGNORE INTO setores (id, nome) VALUES (1, 'Operações');
INSERT OR IGNORE INTO setores (id, nome) VALUES (2, 'Treinamento');

INSERT OR IGNORE INTO empresas (id, nome, cnpj) VALUES (1, 'Empresa Teste', '00.000.000/0001-00');

INSERT OR IGNORE INTO manobras (id, codigo, descricao, ordem) VALUES (1, 'MAN-001', 'Manobra Teste 1', 1);
INSERT OR IGNORE INTO manobras (id, codigo, descricao, ordem) VALUES (2, 'MAN-002', 'Manobra Teste 2', 2);
