-- Migration 0369: Torna simulador_id nullable em simulador_agendamentos
-- Cadeia de FKs: sessoes_checks_resultados → sessoes_checks → simulador_agendamentos
-- Todas precisam ser preservadas, dropadas e recriadas na ordem correta.

-- ============================================================
-- PARTE 1: Preservar e dropar toda a cadeia de FKs
-- (mais filho primeiro, pai por último)
-- ============================================================

CREATE TABLE sessoes_checks_resultados_bak AS SELECT * FROM sessoes_checks_resultados;
DROP TABLE sessoes_checks_resultados;

CREATE TABLE sessoes_checks_bak AS SELECT * FROM sessoes_checks;
DROP TABLE sessoes_checks;

-- ============================================================
-- PARTE 2: Dropar views que referenciam simulador_agendamentos
-- ============================================================

DROP VIEW IF EXISTS vw_gestores_por_setor;
DROP VIEW IF EXISTS sessoes_simulador;
DROP VIEW IF EXISTS fichas_simulador;
DROP VIEW IF EXISTS vw_tripulante_operacional;

-- ============================================================
-- PARTE 3: Recriar simulador_agendamentos com simulador_id nullable
-- ============================================================

ALTER TABLE simulador_agendamentos RENAME TO simulador_agendamentos_bak;

CREATE TABLE simulador_agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  simulador_id INTEGER,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  checador_id INTEGER,
  template_id INTEGER,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'AGENDADO',
  tipo_sessao TEXT,
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  nome TEXT,
  examinador_id INTEGER NULL,
  is_check INTEGER NOT NULL DEFAULT 0,
  empresa_id INTEGER REFERENCES empresas(id),
  tipo_dispositivo TEXT NOT NULL DEFAULT 'SIMULADOR'
    CHECK (tipo_dispositivo IN ('SIMULADOR', 'AERONAVE')),
  aeronave_id INTEGER REFERENCES aeronaves(id)
);

INSERT INTO simulador_agendamentos (
  id, uuid, simulador_id, funcionario_id, instrutor_id, checador_id, template_id,
  data, hora_inicio, hora_fim, duracao_minutos, status, tipo_sessao, observacoes,
  created_at, updated_at, deleted_at, nome, examinador_id, is_check,
  empresa_id, tipo_dispositivo, aeronave_id
)
SELECT
  id, uuid, simulador_id, funcionario_id, instrutor_id, checador_id, template_id,
  data, hora_inicio, hora_fim, duracao_minutos, status, tipo_sessao, observacoes,
  created_at, updated_at, deleted_at, nome, examinador_id, is_check,
  empresa_id,
  COALESCE(tipo_dispositivo, 'SIMULADOR'),
  aeronave_id
FROM simulador_agendamentos_bak;

DROP TABLE simulador_agendamentos_bak;

-- ============================================================
-- PARTE 4: Recriar sessoes_checks com FK para nova tabela
-- ============================================================

CREATE TABLE sessoes_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

INSERT INTO sessoes_checks (id, sessao_id, qualificacao_tipo_id, created_at, updated_at, deleted_at)
SELECT id, sessao_id, qualificacao_tipo_id, created_at, updated_at, deleted_at
FROM sessoes_checks_bak;

DROP TABLE sessoes_checks_bak;

-- ============================================================
-- PARTE 5: Recriar sessoes_checks_resultados
-- ============================================================

CREATE TABLE sessoes_checks_resultados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_check_id INTEGER NOT NULL,
  aprovado INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_check_id) REFERENCES sessoes_checks(id)
);

INSERT INTO sessoes_checks_resultados (id, sessao_check_id, aprovado, observacoes, created_at, updated_at, deleted_at)
SELECT id, sessao_check_id, aprovado, observacoes, created_at, updated_at, deleted_at
FROM sessoes_checks_resultados_bak;

DROP TABLE sessoes_checks_resultados_bak;

-- ============================================================
-- PARTE 6: Recriar índices de simulador_agendamentos
-- ============================================================

CREATE INDEX idx_agendamentos_uuid ON simulador_agendamentos(uuid);
CREATE INDEX idx_agendamentos_data ON simulador_agendamentos(data);
CREATE INDEX idx_agendamentos_simulador_id ON simulador_agendamentos(simulador_id);
CREATE INDEX idx_agendamentos_funcionario_id ON simulador_agendamentos(funcionario_id);
CREATE INDEX idx_agendamentos_instrutor_id ON simulador_agendamentos(instrutor_id);
CREATE INDEX idx_agendamentos_status ON simulador_agendamentos(status);
CREATE INDEX idx_agendamentos_deleted_at ON simulador_agendamentos(deleted_at);
CREATE INDEX idx_agendamentos_data_simulador ON simulador_agendamentos(data, simulador_id);
CREATE INDEX idx_agendamentos_status_deleted_v2 ON simulador_agendamentos(status, deleted_at);
CREATE INDEX idx_agend_func_id_v5 ON simulador_agendamentos(funcionario_id);
CREATE INDEX idx_agend_sim_id_v5 ON simulador_agendamentos(simulador_id);
CREATE INDEX idx_agend_deleted_v5 ON simulador_agendamentos(deleted_at);
CREATE INDEX idx_agend_data_v5 ON simulador_agendamentos(data);
CREATE INDEX idx_agend_status_v5 ON simulador_agendamentos(status);
CREATE INDEX idx_simulador_agendamentos_data ON simulador_agendamentos(data);
CREATE INDEX idx_simulador_agendamentos_simulador_data ON simulador_agendamentos(simulador_id, data) WHERE deleted_at IS NULL;
CREATE INDEX idx_simulador_agendamentos_tipo ON simulador_agendamentos(tipo_sessao) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessoes_examinador ON simulador_agendamentos(examinador_id, is_check, deleted_at);
CREATE INDEX idx_agendamentos_deleted ON simulador_agendamentos(deleted_at);
CREATE INDEX idx_agendamentos_data_deleted ON simulador_agendamentos(data, deleted_at);
CREATE INDEX idx_simulador_agendamentos_empresa ON simulador_agendamentos(empresa_id);
CREATE INDEX idx_sim_agend_tipo_dispositivo ON simulador_agendamentos(tipo_dispositivo);
CREATE INDEX idx_sim_agend_aeronave ON simulador_agendamentos(aeronave_id);

-- ============================================================
-- PARTE 7: Recriar views
-- ============================================================

CREATE VIEW sessoes_simulador AS
SELECT id, simulador_id, funcionario_id AS aluno_id, instrutor_id, checador_id,
  data AS data_sessao, hora_inicio, hora_fim, duracao_minutos, status, tipo_sessao,
  observacoes, created_at, updated_at, deleted_at
FROM simulador_agendamentos;

CREATE VIEW fichas_simulador AS
SELECT f.id, f.agendamento_slot_id AS sessao_id, f.colaborador_id_aluno AS funcionario_id,
  f.instrutor_id, a.data AS data_sessao, f.status, f.observacoes,
  f.created_at, f.updated_at, f.deleted_at
FROM fichas_sessao f
LEFT JOIN simulador_agendamentos a ON f.agendamento_slot_id = a.id;

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
