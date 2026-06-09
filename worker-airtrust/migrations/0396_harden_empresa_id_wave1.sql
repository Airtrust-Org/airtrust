-- Wave 1: Remove empresa_id DEFAULT 1 from critical tables
-- Tables: aeronaves, modelos_sessao, funcionarios
-- Risk: ALTO — schema rebuild com PRAGMA foreign_keys = OFF
-- Backport: requer backup confirmado antes de aplicar
-- Ver: docs/AIRTRUST_EMPRESA_ID_DEFAULT1_INVENTORY_20260608.md

PRAGMA foreign_keys = OFF;

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
-- Dependent views must be dropped before rebuild and recreated after.
-- ===========================================================================

DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP VIEW IF EXISTS notificacoes_nao_lidas;
DROP VIEW IF EXISTS vw_tripulante_operacional;

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

-- Recreate dependent views
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.numero_certificado,
  qh.arquivo_url AS certificado_url,
  qh.nota,
  qh.instrutor,
  qh.observacoes,
  COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
  COALESCE(qt.codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  qt.validade AS qualificacao_validade_meses,
  f.nome AS funcionario_nome,
  f.matricula AS funcionario_matricula,
  f.cargo AS funcionario_cargo,
  f.email AS funcionario_email,
  f.codigo_anac AS funcionario_codigo_anac,
  CASE
    WHEN qh.data_vencimento IS NULL THEN 'INDETERMINADA'
    WHEN julianday(qh.data_vencimento) < julianday('now') THEN 'VENCIDA'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 30 THEN 'PROXIMA_VENCIMENTO'
    WHEN julianday(qh.data_vencimento) - julianday('now') <= 90 THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status,
  CAST(julianday(qh.data_vencimento) - julianday('now') AS INTEGER) AS dias_ate_vencimento,
  qh.created_at,
  qh.updated_at,
  qh.deleted_at
FROM qualificacoes_historico qh
LEFT JOIN qualificacoes_tipos qt ON CAST(qt.id AS TEXT) = CAST(qh.qualificacao_id AS TEXT) AND qt.deleted_at IS NULL
LEFT JOIN funcionarios f ON CAST(f.id AS TEXT) = CAST(qh.funcionario_id AS TEXT) AND f.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

CREATE VIEW notificacoes_nao_lidas AS
SELECT
  n.*,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula
FROM notificacoes_sistema n
LEFT JOIN funcionarios f ON f.id = n.funcionario_id
WHERE n.lida = 0
  AND n.deleted_at IS NULL
ORDER BY
  CASE n.prioridade
    WHEN 'URGENTE' THEN 1
    WHEN 'ALTA' THEN 2
    WHEN 'MEDIA' THEN 3
    WHEN 'BAIXA' THEN 4
    ELSE 5
  END,
  n.created_at DESC;

CREATE VIEW vw_tripulante_operacional AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  COALESCE(NULLIF(TRIM(f.guerra), ''), NULL) AS nome_guerra,
  COALESCE(NULLIF(TRIM(f.matricula), ''), CAST(f.id AS TEXT)) AS matricula,
  f.empresa_id,
  COALESCE(NULLIF(TRIM(f.funcao), ''), NULLIF(TRIM(f.cargo), ''), 'tripulante') AS role,
  COALESCE(f.modelo_aeronave_id, '') AS modelo_aeronave_id,
  COALESCE(f.aeronave, '') AS aeronave_legacy,
  CASE WHEN EXISTS (
    SELECT 1 FROM qualificacoes_historico qh
    LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
    WHERE qh.funcionario_id = f.id AND qh.deleted_at IS NULL
      AND COALESCE(qh.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh.qualificacao_codigo, qt.codigo, '')) = 'CMA'
      AND COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) >= date('now')
  ) THEN 1 ELSE 0 END AS cma_valido,
  CAST((JULIANDAY((
    SELECT MAX(COALESCE(qh2.data_vencimento, date(qh2.data_conclusao, '+' || COALESCE(qh2.validade_meses, qt2.validade, 12) || ' months')))
    FROM qualificacoes_historico qh2
    LEFT JOIN qualificacoes_tipos qt2 ON qt2.id = qh2.qualificacao_id AND qt2.deleted_at IS NULL
    WHERE qh2.funcionario_id = f.id AND qh2.deleted_at IS NULL
      AND COALESCE(qh2.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh2.qualificacao_codigo, qt2.codigo, '')) = 'CMA'
  )) - JULIANDAY('now')) AS INTEGER) AS cma_dias_restantes,
  (SELECT MAX(COALESCE(qh3.data_vencimento, date(qh3.data_conclusao, '+' || COALESCE(qh3.validade_meses, qt3.validade, 12) || ' months')))
    FROM qualificacoes_historico qh3
    LEFT JOIN qualificacoes_tipos qt3 ON qt3.id = qh3.qualificacao_id AND qt3.deleted_at IS NULL
    WHERE qh3.funcionario_id = f.id AND qh3.deleted_at IS NULL
      AND COALESCE(qh3.status, 'CONCLUIDA') != 'CANCELADA'
      AND UPPER(COALESCE(qh3.qualificacao_codigo, qt3.codigo, '')) = 'CMA'
  ) AS cma_validade_fim,
  (WITH base AS (
    SELECT
      COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
      COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
      COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
    FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
  ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) AS frms_score,
  CASE
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa WHERE fa.tripulante_id = f.id AND fa.deleted_at IS NULL AND COALESCE(fa.resolvido, 0) = 0 AND fa.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'critico'
    WHEN (WITH base AS (
      SELECT
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-7 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_7,
        COALESCE(SUM(CASE WHEN date(data) >= date('now', '-28 days') THEN COALESCE(horas_voo_minutos, 0) ELSE 0 END), 0) AS minutos_28,
        COUNT(DISTINCT CASE WHEN date(data) >= date('now', '-28 days') THEN date(data) END) AS dias_28
      FROM frms_jornada WHERE tripulante_id = f.id AND deleted_at IS NULL
    ) SELECT MIN(100, ROUND((minutos_7 / 60.0) * 2.5 + (minutos_28 / 60.0) * 0.8 + dias_28 * 1.1)) FROM base) >= 45 THEN 'atencao'
    ELSE 'ok'
  END AS frms_status,
  (SELECT MAX(created_at) FROM frms_jornada fj WHERE fj.tripulante_id = f.id AND fj.deleted_at IS NULL) AS frms_avaliacao_data,
  (SELECT COUNT(*) FROM sessoes_participantes sp JOIN simulador_agendamentos sa ON sa.id = sp.sessao_id
    WHERE sp.funcionario_id = f.id AND sp.deleted_at IS NULL AND sa.deleted_at IS NULL
      AND UPPER(COALESCE(sa.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa.data) >= date('now')
  ) AS simuladores_pendentes,
  (SELECT MIN(sa2.data) FROM sessoes_participantes sp2 JOIN simulador_agendamentos sa2 ON sa2.id = sp2.sessao_id
    WHERE sp2.funcionario_id = f.id AND sp2.deleted_at IS NULL AND sa2.deleted_at IS NULL
      AND UPPER(COALESCE(sa2.status, 'AGENDADA')) NOT IN ('CONCLUIDA', 'CANCELADA') AND date(sa2.data) >= date('now')
  ) AS proximo_simulador_data,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh4
      LEFT JOIN qualificacoes_tipos qt4 ON qt4.id = qh4.qualificacao_id AND qt4.deleted_at IS NULL
      WHERE qh4.funcionario_id = f.id AND qh4.deleted_at IS NULL AND COALESCE(qh4.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh4.qualificacao_codigo, qt4.codigo, '')) = 'CMA'
        AND COALESCE(qh4.data_vencimento, date(qh4.data_conclusao, '+' || COALESCE(qh4.validade_meses, qt4.validade, 12) || ' months')) >= date('now')
    ) THEN 'BLOQUEADO_CMA'
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa2 WHERE fa2.tripulante_id = f.id AND fa2.deleted_at IS NULL AND COALESCE(fa2.resolvido, 0) = 0 AND fa2.nivel IN ('CRITICO', 'VIOLACAO')) THEN 'BLOQUEADO_FRMS'
    WHEN CAST((JULIANDAY((
      SELECT MAX(COALESCE(qh5.data_vencimento, date(qh5.data_conclusao, '+' || COALESCE(qh5.validade_meses, qt5.validade, 12) || ' months')))
      FROM qualificacoes_historico qh5
      LEFT JOIN qualificacoes_tipos qt5 ON qt5.id = qh5.qualificacao_id AND qt5.deleted_at IS NULL
      WHERE qh5.funcionario_id = f.id AND qh5.deleted_at IS NULL AND COALESCE(qh5.status, 'CONCLUIDA') != 'CANCELADA'
        AND UPPER(COALESCE(qh5.qualificacao_codigo, qt5.codigo, '')) = 'CMA'
    )) - JULIANDAY('now')) AS INTEGER) <= 30 THEN 'ATENCAO_CMA'
    WHEN EXISTS (SELECT 1 FROM frms_alerta fa3 WHERE fa3.tripulante_id = f.id AND fa3.deleted_at IS NULL AND COALESCE(fa3.resolvido, 0) = 0 AND fa3.nivel = 'ATENCAO') THEN 'ATENCAO_FRMS'
    ELSE 'APTO'
  END AS status_operacional
FROM funcionarios f
WHERE f.deleted_at IS NULL AND COALESCE(f.ativo, 1) = 1;

-- ===========================================================================
-- Final validation
-- ===========================================================================

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
