-- Migration 0422: Requisitos explícitos entre modelos de sessão.
--
-- Aditiva por desenho:
-- - não converte histórico;
-- - não realiza backfill especulativo;
-- - permite rollout gradual, pois o backend trata ausência da tabela como sem requisitos configurados.
-- Rollback manual local:
-- - DROP INDEX IF EXISTS idx_modelos_sessao_requisitos_ativo;
-- - DROP INDEX IF EXISTS idx_modelos_sessao_requisitos_requisito;
-- - DROP INDEX IF EXISTS idx_modelos_sessao_requisitos_modelo;
-- - DROP INDEX IF EXISTS idx_modelos_sessao_requisitos_empresa;
-- - DROP INDEX IF EXISTS uq_modelos_sessao_id_empresa;
-- - DROP TABLE IF EXISTS modelos_sessao_requisitos;

CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_sessao_id_empresa
  ON modelos_sessao(id, empresa_id);

CREATE TABLE IF NOT EXISTS modelos_sessao_requisitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  modelo_sessao_id INTEGER NOT NULL,
  requisito_modelo_sessao_id INTEGER NOT NULL,
  tipo_requisito TEXT NOT NULL DEFAULT 'ETAPA_ANTERIOR'
    CHECK(tipo_requisito IN ('ETAPA_ANTERIOR', 'OBSERVACAO', 'OUTRO')),
  obrigatorio INTEGER NOT NULL DEFAULT 1 CHECK(obrigatorio IN (0, 1)),
  ordem INTEGER,
  observacao TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (modelo_sessao_id, empresa_id) REFERENCES modelos_sessao(id, empresa_id),
  FOREIGN KEY (requisito_modelo_sessao_id, empresa_id) REFERENCES modelos_sessao(id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_empresa
  ON modelos_sessao_requisitos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_modelo
  ON modelos_sessao_requisitos(modelo_sessao_id);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_requisito
  ON modelos_sessao_requisitos(requisito_modelo_sessao_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_ativo
  ON modelos_sessao_requisitos(modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito)
  WHERE deleted_at IS NULL;
