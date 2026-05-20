-- DEV CORE SCHEMA FAST (minimal) - recreates essential tables and view for qualificacoes
DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP TABLE IF EXISTS qualificacoes_historico;
DROP TABLE IF EXISTS qualificacoes_tipos;
DROP TABLE IF EXISTS funcionarios;

CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT,
  matricula TEXT,
  cargo TEXT,
  departamento TEXT,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  nome_guerra TEXT,
  cpf TEXT,
  telefone TEXT,
  funcao TEXT,
  setor TEXT,
  base TEXT,
  aeronave TEXT,
  data_admissao DATE,
  codigo_anac TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1
);

CREATE TABLE qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  validade_meses INTEGER,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id TEXT,
  tipo_codigo TEXT,
  categoria TEXT,
  data_conclusao DATE,
  data_vencimento DATE,
  validade_meses INTEGER,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT,
  nota INTEGER,
  carga_horaria INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Seed mínimo para testes
INSERT INTO funcionarios (nome, email, matricula, cargo) VALUES
 ('Funcionario Teste','teste@local','MT001','Piloto');

INSERT INTO qualificacoes_tipos (id, nome, codigo, categoria, descricao, validade_meses) VALUES
 ('tipo-1','Treinamento Inicial','TR-INIC','TREINAMENTO','Treinamento base',12);

INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, tipo_codigo, categoria, data_conclusao, data_vencimento, validade_meses, numero_certificado, observacoes)
VALUES (1,'tipo-1','TR-INIC','TREINAMENTO',date('now','-20 days'),date('now','+345 days'),12,'CERT-123','Registro inicial');

-- View replicando colunas esperadas pelo endpoint
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  COALESCE(qh.tipo_codigo, qt.codigo) AS qualificacao_codigo,
  COALESCE(qh.tipo_codigo, qt.nome) AS qualificacao_nome,
  COALESCE(qh.categoria, qt.categoria) AS qualificacao_categoria,
  qt.descricao AS qualificacao_descricao,
  COALESCE(qh.validade_meses, qt.validade_meses) AS qualificacao_validade_meses,
  qt.ativo AS qualificacao_ativo,
  COALESCE(qh.tipo_codigo, qh.codigo, qt.codigo || ' - ' || qt.nome) AS qualificacao_display,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.data_vencimento AS data_validade,
  qh.validade_meses,
  qh.numero_certificado,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.instrutor,
  qh.local AS local_treinamento,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
  qh.created_at,
  qh.updated_at,
  CASE
    WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now','+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now','+31 days') AND DATE('now','+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.data_vencimento IS NULL THEN NULL
    ELSE CAST((julianday(qh.data_vencimento) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento,
  f.nome AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.email AS funcionario_email,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.data_admissao AS funcionario_data_admissao,
  f.codigo_anac AS funcionario_codigo_anac,
  f.is_instrutor AS funcionario_is_instrutor,
  f.is_checador AS funcionario_is_checador,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
