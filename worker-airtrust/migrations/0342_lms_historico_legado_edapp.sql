-- =========================================
-- LMS — Histórico legado importado do EdApp
-- Migration: 0342_lms_historico_legado_edapp.sql
-- Data: 2026-04-20
-- Descrição: preserva conclusões históricas do EdApp dentro do domínio do LMS
-- =========================================

CREATE TABLE IF NOT EXISTS lms_historico_importado (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  fonte TEXT NOT NULL DEFAULT 'EDAPP',
  integracao_evento_id INTEGER,
  funcionario_id INTEGER,
  funcionario_nome TEXT,
  curso_id INTEGER,
  curso_titulo TEXT NOT NULL,
  curso_categoria TEXT,
  tipo_conteudo TEXT,
  status TEXT NOT NULL DEFAULT 'CONCLUIDO',
  progresso_pct INTEGER NOT NULL DEFAULT 100,
  score_final REAL,
  qualificacao_codigo TEXT,
  qualificacao_historico_id INTEGER,
  edapp_user_id TEXT,
  edapp_course_id TEXT,
  edapp_course_external_id TEXT,
  edapp_course_title TEXT,
  completed_at TEXT,
  data_conclusao TEXT,
  funcionario_match_type TEXT,
  curso_match_type TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(empresa_id, fonte, integracao_evento_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_historico_importado_empresa
  ON lms_historico_importado(empresa_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_historico_importado_funcionario
  ON lms_historico_importado(funcionario_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_historico_importado_curso
  ON lms_historico_importado(curso_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_historico_importado_fonte
  ON lms_historico_importado(fonte, data_conclusao) WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_lms_historico_importado_updated_at
AFTER UPDATE ON lms_historico_importado
FOR EACH ROW
BEGIN
  UPDATE lms_historico_importado
  SET updated_at = datetime('now')
  WHERE id = NEW.id;
END;