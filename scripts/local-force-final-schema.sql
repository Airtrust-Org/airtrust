-- FOR DEV ONLY: Force-create final qualificacoes_historico schema and view
DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP TABLE IF EXISTS qualificacoes_historico;
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id TEXT,
  tipo_codigo TEXT,
  categoria TEXT,
  orgao_emissor TEXT,
  data_conclusao DATE,
  data_vencimento DATE,
  validade_meses INTEGER,
  numero_certificado TEXT,
  arquivo_url TEXT,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT,
  nota INTEGER,
  carga_horaria INTEGER,
  observacoes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
  deleted_at TEXT
);

-- Rebuild funcionarios with full extended schema (preserve existing data)
CREATE TABLE funcionarios_full (
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
  ativo INTEGER DEFAULT 1,
  nivel_icao TEXT,
  validade_icao DATE,
  cma TEXT,
  validade_cma DATE,
  aso TEXT,
  validade_aso DATE,
  telefone_emergencia TEXT,
  foto_url TEXT,
  rg TEXT,
  data_nascimento DATE,
  sexo TEXT,
  nacionalidade TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  sispat TEXT,
  prestserv TEXT,
  contato_emergencia_nome TEXT
);

INSERT INTO funcionarios_full (
  id, nome, email, matricula, cargo, departamento, status, observacoes,
  created_at, updated_at, deleted_at, nome_guerra, cpf, telefone, funcao, setor, base,
  aeronave, data_admissao, codigo_anac, is_instrutor, is_checador, ativo
) SELECT id, nome, email, matricula, cargo, departamento, status, observacoes,
         created_at, updated_at, deleted_at, nome_guerra, cpf, telefone, funcao, setor, base,
         aeronave, data_admissao, codigo_anac, is_instrutor, is_checador, ativo
  FROM funcionarios;

DROP TABLE funcionarios;
ALTER TABLE funcionarios_full RENAME TO funcionarios;

-- Recreate final view (same as migration 0089)
CREATE VIEW qualificacoes_historico_v AS
SELECT 
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.tipo_codigo AS qualificacao_codigo,
  qh.tipo_codigo AS qualificacao_nome,
  qh.categoria AS qualificacao_categoria,
  qh.orgao_emissor AS qualificacao_orgao_emissor,
  COALESCE(qh.tipo_codigo, qt.codigo, qt.nome) AS qualificacao_display,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.data_vencimento AS data_validade,
  qh.validade_meses,
  qh.numero_certificado,
  qh.observacoes,
  qh.arquivo_url,
  qh.instrutor,
  qh.local,
  qh.modalidade,
  qh.nota,
  qh.carga_horaria,
  qh.created_at,
  qh.updated_at,
  CASE
    WHEN qh.data_vencimento IS NULL AND qh.validade_meses IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.data_vencimento) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.data_vencimento) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
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
  f.cpf AS funcionario_cpf,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.departamento AS funcionario_departamento,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.escala AS funcionario_escala,
  f.status AS funcionario_status,
  f.ativo AS funcionario_ativo,
  f.is_instrutor AS funcionario_is_instrutor,
  f.is_checador AS funcionario_is_checador,
  f.codigo_anac AS funcionario_codigo_anac,
  f.nivel_icao AS funcionario_nivel_icao,
  f.validade_icao AS funcionario_validade_icao,
  f.cma AS funcionario_cma,
  f.validade_cma AS funcionario_validade_cma,
  f.aso AS funcionario_aso,
  f.validade_aso AS funcionario_validade_aso,
  f.telefone AS funcionario_telefone,
  f.telefone_emergencia AS funcionario_telefone_emergencia,
  f.foto_url AS funcionario_foto_url,
  f.data_admissao AS funcionario_data_admissao,
  f.rg AS funcionario_rg,
  f.data_nascimento AS funcionario_data_nascimento,
  f.sexo AS funcionario_sexo,
  f.nacionalidade AS funcionario_nacionalidade,
  f.cep AS funcionario_cep,
  f.logradouro AS funcionario_logradouro,
  f.numero AS funcionario_numero,
  f.complemento AS funcionario_complemento,
  f.bairro AS funcionario_bairro,
  f.cidade AS funcionario_cidade,
  f.estado AS funcionario_estado,
  f.sispat AS funcionario_sispat,
  f.prestserv AS funcionario_prestserv,
  f.contato_emergencia_nome AS funcionario_contato_emergencia,
  f.observacoes AS funcionario_observacoes
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

-- Basic index examples
CREATE INDEX IF NOT EXISTS idx_qh_funcionario ON qualificacoes_historico(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qh_vencimento ON qualificacoes_historico(data_vencimento);
