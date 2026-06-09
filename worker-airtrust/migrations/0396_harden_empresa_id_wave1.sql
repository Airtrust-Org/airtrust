-- Wave 1: Remove empresa_id DEFAULT 1 from critical tables
-- Tables: aeronaves, modelos_sessao, funcionarios
-- Risk: ALTO — schema rebuild com PRAGMA defer_foreign_keys
-- Backport: requer backup confirmado antes de aplicar
-- Ver: docs/AIRTRUST_EMPRESA_ID_DEFAULT1_INVENTORY_20260608.md

PRAGMA defer_foreign_keys = ON;

-- ===========================================================================
-- 1. aeronaves (23 rows, 0 NULL, 0 empresa_id=1)
-- ===========================================================================

CREATE TABLE aeronaves_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  modelo TEXT NOT NULL,
  fabricante TEXT,
  prefixo TEXT,
  ano_fabricacao INTEGER,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

INSERT INTO aeronaves_new (
  id, codigo, modelo, fabricante, prefixo, ano_fabricacao,
  status, observacoes, created_at, updated_at, deleted_at, empresa_id
)
SELECT
  id, codigo, modelo, fabricante, prefixo, ano_fabricacao,
  status, observacoes, created_at, updated_at, deleted_at, empresa_id
FROM aeronaves;

DROP TABLE aeronaves;
ALTER TABLE aeronaves_new RENAME TO aeronaves;

CREATE INDEX idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_aeronaves_empresa ON aeronaves(empresa_id);
CREATE INDEX idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;

-- ===========================================================================
-- 2. modelos_sessao (60 rows, 0 NULL, 0 empresa_id=1)
-- ===========================================================================

CREATE TABLE modelos_sessao_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT,
  descricao TEXT,
  duracao_estimada INTEGER,
  treinamento_id TEXT,
  ordem_no_treinamento INTEGER,
  ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  tipo_sessao_id INTEGER,
  tipo_aeronave TEXT,
  codigo_aeronave TEXT,
  gera_qualificacao BOOLEAN DEFAULT 0,
  empresa_id INTEGER NOT NULL,
  modelo_aeronave TEXT,
  qualificacao_tipo_id INTEGER NULL REFERENCES qualificacoes_tipos(id)
);

INSERT INTO modelos_sessao_new (
  id, codigo, nome, tipo, descricao, duracao_estimada,
  treinamento_id, ordem_no_treinamento, ativo,
  created_at, updated_at, deleted_at,
  tipo_sessao_id, tipo_aeronave, codigo_aeronave,
  gera_qualificacao, empresa_id, modelo_aeronave, qualificacao_tipo_id
)
SELECT
  id, codigo, nome, tipo, descricao, duracao_estimada,
  treinamento_id, ordem_no_treinamento, ativo,
  created_at, updated_at, deleted_at,
  tipo_sessao_id, tipo_aeronave, codigo_aeronave,
  gera_qualificacao, empresa_id, modelo_aeronave, qualificacao_tipo_id
FROM modelos_sessao;

DROP TABLE modelos_sessao;
ALTER TABLE modelos_sessao_new RENAME TO modelos_sessao;

CREATE INDEX idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave);
CREATE INDEX idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);
CREATE INDEX idx_modelos_sessao_tipo_aeronave ON modelos_sessao(tipo_sessao_id, codigo_aeronave) WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_aeronave_codigo ON modelos_sessao(codigo_aeronave);
CREATE INDEX idx_modelos_sessao_codigo_aeronave ON modelos_sessao(tipo_sessao_id, codigo_aeronave) WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_tipo_sessao_aeronave ON modelos_sessao(tipo_sessao_id, tipo_aeronave) WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_sessao_tipo ON modelos_sessao(tipo_sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_modelos_deleted ON modelos_sessao(deleted_at);
CREATE INDEX idx_modelos_codigo ON modelos_sessao(codigo);
CREATE INDEX idx_modelos_sessao_ordem ON modelos_sessao(treinamento_id, ordem_no_treinamento);
CREATE INDEX idx_modelos_sessao_treinamento ON modelos_sessao(treinamento_id);
CREATE INDEX idx_modelos_sessao_deleted ON modelos_sessao(deleted_at);
CREATE INDEX idx_modelos_sessao_ativo ON modelos_sessao(ativo);
CREATE INDEX idx_modelos_sessao_codigo ON modelos_sessao(codigo);

-- ===========================================================================
-- 3. funcionarios (68 rows, 0 NULL, 0 empresa_id=1)
-- ===========================================================================

CREATE TABLE funcionarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT,
  matricula TEXT,
  cpf TEXT,
  cargo TEXT,
  departamento TEXT,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  guerra TEXT,
  funcao TEXT,
  setor TEXT,
  codigo_anac TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  rg TEXT,
  nascimento TEXT,
  sexo TEXT,
  nacionalidade TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,
  foto_url TEXT,
  base TEXT,
  aeronave TEXT,
  nivel_icao TEXT,
  validade_icao TEXT,
  cma TEXT,
  validade_cma TEXT,
  aso TEXT,
  validade_aso TEXT,
  sispat TEXT,
  prestserv TEXT,
  endereco TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  escala TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  telefone TEXT,
  licenca TEXT,
  admissao TEXT,
  modelo_aeronave_id TEXT,
  empresa_id INTEGER NOT NULL,
  data_realizacao_icao TEXT,
  data_realizacao_cma TEXT,
  data_realizacao_aso TEXT,
  is_examinador INTEGER NOT NULL DEFAULT 0,
  quinzena TEXT CHECK(quinzena IN ('primeira', 'segunda', 'personalizada')) DEFAULT 'primeira'
);

INSERT INTO funcionarios_new (
  id, nome, email, matricula, cpf, cargo, departamento,
  status, observacoes, guerra, funcao, setor, codigo_anac,
  is_instrutor, is_checador, ativo, rg, nascimento, sexo,
  nacionalidade, telefone_emergencia, contato_emergencia_nome,
  foto_url, base, aeronave, nivel_icao, validade_icao,
  cma, validade_cma, aso, validade_aso, sispat, prestserv,
  endereco, cep, logradouro, numero, complemento, bairro,
  cidade, estado, escala, created_at, updated_at, deleted_at,
  telefone, licenca, admissao, modelo_aeronave_id, empresa_id,
  data_realizacao_icao, data_realizacao_cma, data_realizacao_aso,
  is_examinador, quinzena
)
SELECT
  id, nome, email, matricula, cpf, cargo, departamento,
  status, observacoes, guerra, funcao, setor, codigo_anac,
  is_instrutor, is_checador, ativo, rg, nascimento, sexo,
  nacionalidade, telefone_emergencia, contato_emergencia_nome,
  foto_url, base, aeronave, nivel_icao, validade_icao,
  cma, validade_cma, aso, validade_aso, sispat, prestserv,
  endereco, cep, logradouro, numero, complemento, bairro,
  cidade, estado, escala, created_at, updated_at, deleted_at,
  telefone, licenca, admissao, modelo_aeronave_id, empresa_id,
  data_realizacao_icao, data_realizacao_cma, data_realizacao_aso,
  is_examinador, quinzena
FROM funcionarios;

DROP TABLE funcionarios;
ALTER TABLE funcionarios_new RENAME TO funcionarios;

CREATE INDEX idx_funcionarios_data_realizacao_aso ON funcionarios(data_realizacao_aso);
CREATE INDEX idx_funcionarios_data_realizacao_cma ON funcionarios(data_realizacao_cma);
CREATE INDEX idx_funcionarios_data_realizacao_icao ON funcionarios(data_realizacao_icao);
CREATE INDEX idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
CREATE INDEX idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);
CREATE INDEX idx_funcionarios_modelo_aeronave_id ON funcionarios(modelo_aeronave_id);
CREATE INDEX idx_funcionarios_quinzena ON funcionarios(quinzena) WHERE deleted_at IS NULL;

-- ===========================================================================
-- Final validation
-- ===========================================================================

PRAGMA foreign_key_check;
