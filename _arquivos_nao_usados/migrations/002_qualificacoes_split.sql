-- Migration 002: Separar qualificacoes em tipos + histórico
-- Data: 2025-11-14
-- Objetivo: Normalizar estrutura conforme modelo aprovado (3 módulos)

-- 1) Criar tabela de tipos (catálogo de qualificações)
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  tipo TEXT, -- TREINAMENTO/EXAME/CHECK
  descricao TEXT,
  validade_meses INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 2) Criar tabela de histórico (qualificações por funcionário)
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id TEXT PRIMARY KEY,
  funcionario_id TEXT NOT NULL,
  qualificacao_id TEXT NOT NULL, -- FK para qualificacoes_tipos.id
  data_conclusao TEXT,
  data_vencimento TEXT,
  status TEXT DEFAULT 'VIGENTE',
  observacoes TEXT,
  certificado_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);

-- 3) Migrar dados existentes (se tabela antiga qualificacoes existir)
-- Popular tipos pela combinação (codigo, nome, categoria)
INSERT OR IGNORE INTO qualificacoes_tipos (id, codigo, nome, categoria, tipo)
SELECT DISTINCT
  COALESCE(codigo, lower(replace(nome,' ', '_'))) AS id,
  COALESCE(codigo, 'COD_' || substr(lower(replace(nome,' ', '_')),1,10)) AS codigo,
  nome,
  categoria,
  tipo
FROM qualificacoes
WHERE deleted_at IS NULL;

-- Popular histórico referenciando o tipo
INSERT OR IGNORE INTO qualificacoes_historico (
  id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status, observacoes
)
SELECT
  q.id,
  q.funcionario_id,
  COALESCE(q.codigo, lower(replace(q.nome,' ', '_'))) AS qualificacao_id,
  q.data_emissao,
  q.data_validade,
  q.status,
  q.observacoes
FROM qualificacoes q
WHERE q.deleted_at IS NULL
  AND q.funcionario_id IS NOT NULL;

-- 4) Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

-- 5) Criar view de compatibilidade (opcional, para não quebrar queries antigas)
CREATE VIEW IF NOT EXISTS qualificacoes_view AS
SELECT
  h.id,
  h.funcionario_id,
  t.codigo,
  t.nome,
  t.categoria,
  t.tipo,
  h.data_conclusao AS data_emissao,
  h.data_vencimento AS data_validade,
  h.status,
  h.observacoes,
  h.certificado_url,
  h.created_at,
  h.updated_at,
  h.deleted_at
FROM qualificacoes_historico h
JOIN qualificacoes_tipos t ON t.id = h.qualificacao_id
WHERE h.deleted_at IS NULL;

-- 6) Opcional: marcar tabela antiga como legada (não deletar ainda, apenas soft delete em massa)
-- UPDATE qualificacoes SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE deleted_at IS NULL;
