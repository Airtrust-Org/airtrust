-- Migration: 0232_notificacoes_inapp
-- Notificações in-app (sino no header) — escalas publicadas, CMA vencendo, etc.
-- Data: 2026-03-05

CREATE TABLE IF NOT EXISTS notificacoes_inapp (
  id              TEXT    PRIMARY KEY,
  funcionario_id  TEXT    NOT NULL REFERENCES funcionarios(id),
  empresa_id      INTEGER NOT NULL REFERENCES empresas(id),
  tipo            TEXT    NOT NULL, -- 'escala_publicada','cma_vencendo','escala_alterada'
  titulo          TEXT    NOT NULL,
  mensagem        TEXT,
  lida            INTEGER NOT NULL DEFAULT 0,
  referencia_id   TEXT,             -- id da escala ou qualificacao
  referencia_tipo TEXT,             -- 'escala' | 'qualificacao'
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_inapp_funcionario
  ON notificacoes_inapp(funcionario_id, lida)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notif_inapp_empresa
  ON notificacoes_inapp(empresa_id, created_at DESC)
  WHERE deleted_at IS NULL;
