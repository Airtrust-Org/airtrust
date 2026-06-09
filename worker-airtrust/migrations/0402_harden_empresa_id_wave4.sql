-- Wave 4: finalize empresa_id hardening on remaining DEFAULT 1 tables
-- and clean up empresa_id=1 operational duplicates.
--
-- Tables included:
--   1. importacoes_log — remove DEFAULT 1, enforce NOT NULL
--   2. qualificacoes_tipos — remove DEFAULT 1, enforce NOT NULL,
--      backfill 5 soft-deleted empresa_id=1 rows to tenant 6
--   3. sgso_spi_config — soft-delete 7 empresa_id=1 rows that are
--      operational duplicates of the canonical empresa_id=6 SPI defaults
--
-- Tables confirmed already hardened (NOT NULL, no DEFAULT):
--   certificados_templates, escala_voo_diaria, notificacoes_convocacao_email_config,
--   requisitos_compliance
--
-- Safety model:
--   - All backfills are deterministic.
--   - qualificacoes_tipos: the 5 empresa_id=1 rows are all soft-deleted;
--     all 88 active rows are on empresa_id=6.
--   - sgso_spi_config: 7 empresa_id=1 rows have exact name+codigo matches
--     in the 7 empresa_id=6 rows (duplicate seed); runtime queries by
--     empresa_id so the empresa_id=1 set is invisible to real tenants.

PRAGMA foreign_keys = OFF;

-- ===========================================================================
-- 1. importacoes_log
-- 58 rows, all on empresa_id=6, no NULLs, no empresa_id=1.
-- Schema before: empresa_id has a default of 1. After: NOT NULL, no default.
-- ===========================================================================

CREATE TABLE importacoes_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT NOT NULL,
  usuario_id INTEGER,
  total_rows INTEGER NOT NULL DEFAULT 0,
  to_create INTEGER NOT NULL DEFAULT 0,
  to_update INTEGER NOT NULL DEFAULT 0,
  to_skip INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  merge_mode TEXT,
  raw_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  empresa_id INTEGER NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

INSERT INTO importacoes_log_new
SELECT
  id, entidade, usuario_id, total_rows, to_create, to_update, to_skip,
  created, updated, skipped, failed, merge_mode, raw_data, created_at,
  CASE
    WHEN empresa_id IS NOT NULL AND empresa_id <> 1 THEN empresa_id
    ELSE NULL
  END AS empresa_id
FROM importacoes_log;

DROP TABLE importacoes_log;
ALTER TABLE importacoes_log_new RENAME TO importacoes_log;

-- ===========================================================================
-- 2. qualificacoes_tipos
-- 93 rows total: 88 active (empresa_id=6), 5 soft-deleted (empresa_id=1).
-- Backfill: the 5 soft-deleted empresa_id=1 rows are moved to 6.
-- All 88 active rows are already on 6 — no ambiguity.
--
-- Triggers referencing qualificacoes_tipos must be dropped before the
-- table rebuild; they are recreated after the rename.
-- ===========================================================================

DROP VIEW IF EXISTS qualificacoes_historico_v;
DROP VIEW IF EXISTS vw_tripulante_operacional;
DROP TRIGGER IF EXISTS trg_qualificacoes_tipos_update;
DROP TRIGGER IF EXISTS trg_tipo_update_auditoria;
DROP TRIGGER IF EXISTS trg_qualificacoes_historico_set_tipo;
DROP TRIGGER IF EXISTS trg_qualificacoes_historico_update_tipo;
DROP TRIGGER IF EXISTS trg_apply_reclassification;

CREATE TABLE qualificacoes_tipos_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT,
  codigo TEXT NOT NULL COLLATE NOCASE,
  nome TEXT NOT NULL CHECK(length(trim(nome)) >= 3),
  descricao TEXT,
  categoria TEXT,
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  carga_horaria_inicial REAL CHECK(carga_horaria_inicial IS NULL OR carga_horaria_inicial > 0),
  carga_horaria_recorrente REAL CHECK(carga_horaria_recorrente IS NULL OR carga_horaria_recorrente > 0),
  conteudo_programatico TEXT DEFAULT NULL,
  validade INTEGER CHECK(validade IS NULL OR validade > 0),
  vencimento_fim_mes INTEGER DEFAULT 0 CHECK(vencimento_fim_mes IN (0, 1)),
  observacoes TEXT,
  ativo INTEGER DEFAULT 1 CHECK(ativo IN (0, 1)),
  is_check INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  empresa_id INTEGER NOT NULL
);

INSERT INTO qualificacoes_tipos_new (
  id, tipo, codigo, nome, descricao, categoria,
  carga_horaria, carga_horaria_inicial, carga_horaria_recorrente,
  conteudo_programatico, validade, vencimento_fim_mes, observacoes,
  ativo, is_check, created_at, updated_at, deleted_at, empresa_id
)
SELECT
  id, tipo, codigo, nome, descricao, categoria,
  carga_horaria, carga_horaria_inicial, carga_horaria_recorrente,
  conteudo_programatico, validade, vencimento_fim_mes, observacoes,
  ativo, is_check, created_at, updated_at, deleted_at,
  CASE
    WHEN empresa_id IS NOT NULL AND empresa_id <> 1 THEN empresa_id
    WHEN empresa_id = 1 AND deleted_at IS NOT NULL THEN 6
    ELSE NULL
  END AS empresa_id
FROM qualificacoes_tipos;

DROP TABLE qualificacoes_tipos;
ALTER TABLE qualificacoes_tipos_new RENAME TO qualificacoes_tipos;

-- Recreate critical indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo
  ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_empresa
  ON qualificacoes_tipos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_deleted_at
  ON qualificacoes_tipos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria
  ON qualificacoes_tipos(categoria, ativo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_ativo
  ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;

-- Recreate views that reference qualificacoes_tipos
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

-- Recreate triggers that were dropped before the rebuild
CREATE TRIGGER trg_qualificacoes_historico_set_tipo
AFTER INSERT ON qualificacoes_historico
WHEN NEW.tipo IS NULL AND NEW.qualificacao_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_qualificacoes_tipos_update
AFTER UPDATE ON qualificacoes_tipos
FOR EACH ROW
WHEN OLD.deleted_at IS NULL
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela,
    registro_id,
    acao,
    dados_anteriores,
    dados_novos
  )
  VALUES (
    'qualificacoes_tipos',
    NEW.id,
    'UPDATE',
    json_object(
      'codigo', OLD.codigo,
      'nome', OLD.nome,
      'validade', OLD.validade,
      'vencimento_fim_mes', OLD.vencimento_fim_mes,
      'categoria', OLD.categoria,
      'ativo', OLD.ativo
    ),
    json_object(
      'codigo', NEW.codigo,
      'nome', NEW.nome,
      'validade', NEW.validade,
      'vencimento_fim_mes', NEW.vencimento_fim_mes,
      'categoria', NEW.categoria,
      'ativo', NEW.ativo
    )
  );
END;

CREATE TRIGGER trg_tipo_update_auditoria
AFTER UPDATE ON qualificacoes_tipos
WHEN NEW.validade != OLD.validade OR NEW.vencimento_fim_mes != OLD.vencimento_fim_mes
BEGIN
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, dados_anteriores, dados_novos)
  VALUES ('qualificacoes_tipos', NEW.id, 'UPDATE_TIPO_RECALCULO',
    json_object('validade', OLD.validade, 'vencimento_fim_mes', OLD.vencimento_fim_mes),
    json_object('validade', NEW.validade, 'vencimento_fim_mes', NEW.vencimento_fim_mes));
END;

CREATE TRIGGER trg_qualificacoes_historico_update_tipo
AFTER UPDATE OF qualificacao_id ON qualificacoes_historico
WHEN NEW.qualificacao_id IS NOT NULL
  AND (OLD.qualificacao_id IS NULL OR OLD.qualificacao_id != NEW.qualificacao_id)
BEGIN
  UPDATE qualificacoes_historico
  SET tipo = (
    SELECT nome FROM qualificacoes_tipos
    WHERE id = NEW.qualificacao_id
    LIMIT 1
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER trg_apply_reclassification
AFTER UPDATE ON qualificacoes_historico_reclass_queue
WHEN NEW.status = 'APPLIED' AND NEW.target_tipo_id IS NOT NULL
BEGIN
  UPDATE qualificacoes_historico
  SET qualificacao_id = NEW.target_tipo_id,
      codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      tipo_codigo = (SELECT codigo FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      categoria = (SELECT categoria FROM qualificacoes_tipos WHERE id = NEW.target_tipo_id),
      updated_at = datetime('now')
  WHERE id = NEW.historico_id;
  INSERT INTO _data_recovery_log(etapa, detalhes)
  VALUES ('APPLY_RECLASS', 'historico_id=' || NEW.historico_id || ' -> tipo_id=' || NEW.target_tipo_id);
END;

-- ===========================================================================
-- 3. sgso_spi_config — soft-delete the 7 empresa_id=1 operational duplicates.
-- The 7 canonical rows on empresa_id=6 are untouched.
-- Runtime queries already use WHERE empresa_id = ? AND ativo = 1.
-- ===========================================================================

UPDATE sgso_spi_config
SET ativo = 0,
    updated_at = datetime('now')
WHERE empresa_id = 1
  AND ativo = 1;

CREATE VIEW IF NOT EXISTS vw_tripulante_operacional AS
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


PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
