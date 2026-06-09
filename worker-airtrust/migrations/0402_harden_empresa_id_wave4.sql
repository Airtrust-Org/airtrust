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

-- Recreate critical indexes
CREATE UNIQUE INDEX idx_qualificacoes_tipos_codigo
  ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_tipos_empresa
  ON qualificacoes_tipos(empresa_id);
CREATE INDEX idx_qualificacoes_tipos_deleted_at
  ON qualificacoes_tipos(deleted_at);
CREATE INDEX idx_qualificacoes_tipos_categoria
  ON qualificacoes_tipos(categoria, ativo) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_tipos_ativo
  ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;

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
SET deleted_at = datetime('now'),
    updated_at = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL;

PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
