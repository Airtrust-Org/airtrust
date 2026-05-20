-- AirTrust Dev Bootstrap (Consolidated Schema + Minimal Seed + View)
-- Date: 2025-11-22
-- Idempotent: uses CREATE TABLE IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS

-- Funcionarios (extended columns needed by view)
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT,
  nome TEXT NOT NULL,
  nome_guerra TEXT,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  cargo TEXT,
  funcao TEXT,
  setor TEXT,
  base TEXT,
  aeronave TEXT,
  data_admissao TEXT,
  codigo_anac TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ATIVO',
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

-- Qualificacoes Tipos
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  tipo TEXT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT NOT NULL,
  carga_horaria REAL,
  validade INTEGER,
  observacoes TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

-- Qualificacoes Historico (modern unified columns)
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  data_conclusao TEXT,
  data_vencimento TEXT,
  validade_meses INTEGER,
  tipo_codigo TEXT,
  categoria TEXT,
  codigo TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  nota REAL,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT,
  carga_horaria INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo ON funcionarios(ativo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qual_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qh_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

-- Seed minimal (only if empty)
INSERT INTO funcionarios (nome, matricula, cargo, setor, funcao, codigo_anac, base)
SELECT 'Dev Piloto', 'DEV001', 'Comandante', 'Operações', 'PIC', 'ANACDEV1', 'SBGR'
WHERE NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula='DEV001');

INSERT INTO funcionarios (nome, matricula, cargo, setor, funcao, codigo_anac, base)
SELECT 'Dev Copiloto', 'DEV002', 'Copiloto', 'Operações', 'SIC', 'ANACDEV2', 'SBGR'
WHERE NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula='DEV002');

INSERT INTO qualificacoes_tipos (nome, codigo, categoria, descricao, validade_meses)
SELECT 'Dangerous Goods', 'DG-IATA', 'Regulatório', 'DG Training', 24
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE codigo='DG-IATA');

INSERT INTO qualificacoes_tipos (nome, codigo, categoria, descricao, validade_meses)
SELECT 'CRM Cockpit Resource', 'CRM-BASIC', 'Treinamento', 'CRM Básico', 24
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE codigo='CRM-BASIC');

INSERT INTO qualificacoes_tipos (nome, codigo, categoria, descricao, validade_meses)
SELECT 'Habilitação A320', 'HAB-A320', 'Habilitação', 'Type Rating A320', 12
WHERE NOT EXISTS (SELECT 1 FROM qualificacoes_tipos WHERE codigo='HAB-A320');

-- Seed historico (uses data_conclusao + validade)
INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, data_conclusao, data_vencimento, validade_meses, tipo_codigo, categoria, codigo, numero_certificado, observacoes)
SELECT f.id, qt.id, '2025-01-10', '2026-01-10', qt.validade_meses, qt.codigo, qt.categoria, qt.codigo, 'CERT-DEV-001', 'Registro inicial'
FROM funcionarios f CROSS JOIN qualificacoes_tipos qt
WHERE qt.codigo='HAB-A320' AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico WHERE numero_certificado='CERT-DEV-001');

-- Normalize backfill (idempotent)
UPDATE qualificacoes_historico SET tipo_codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id=qualificacao_id) WHERE tipo_codigo IS NULL;
UPDATE qualificacoes_historico SET categoria = (SELECT categoria FROM qualificacoes_tipos WHERE id=qualificacao_id) WHERE categoria IS NULL;
UPDATE qualificacoes_historico SET codigo = tipo_codigo WHERE codigo IS NULL;
UPDATE qualificacoes_historico SET validade_meses = (SELECT validade_meses FROM qualificacoes_tipos WHERE id=qualificacao_id) WHERE validade_meses IS NULL;

-- View integrada removida. Utilize diretamente a tabela qualificacoes_historico
