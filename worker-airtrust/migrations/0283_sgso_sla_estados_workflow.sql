-- Migration 0283: SLA + estados operacionais para workflow de triagem/investigação
-- Adiciona rastreamento de tempo nas transições de status e prazos SLA por fase

-- 1. Colunas de timestamp por fase no workflow
ALTER TABLE sgso_relatos ADD COLUMN em_triagem_em TEXT;
ALTER TABLE sgso_relatos ADD COLUMN em_investigacao_em TEXT;
ALTER TABLE sgso_relatos ADD COLUMN concluido_em TEXT;

-- 2. Prazos SLA configuráveis por fase
--    sla_triagem_prazo    = created_at + 24h  (SLA analisar relato)
--    sla_investigacao_prazo = em_triagem_em + 72h (SLA concluir investigação)
ALTER TABLE sgso_relatos ADD COLUMN sla_triagem_prazo TEXT;
ALTER TABLE sgso_relatos ADD COLUMN sla_investigacao_prazo TEXT;
ALTER TABLE sgso_relatos ADD COLUMN sla_triagem_violado INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sgso_relatos ADD COLUMN sla_investigacao_violado INTEGER NOT NULL DEFAULT 0;

-- 3. Investigador responsável pela fase de investigação
ALTER TABLE sgso_relatos ADD COLUMN investigador_id INTEGER REFERENCES funcionarios(id);

-- 4. Backfill: computar sla_triagem_prazo para relatos ABERTO existentes
UPDATE sgso_relatos
SET sla_triagem_prazo = datetime(created_at, '+24 hours')
WHERE status = 'ABERTO'
  AND sla_triagem_prazo IS NULL
  AND deleted_at IS NULL;

-- 5. Backfill: marcar violações de triagem já expiradas
UPDATE sgso_relatos
SET sla_triagem_violado = 1
WHERE status = 'ABERTO'
  AND sla_triagem_prazo IS NOT NULL
  AND sla_triagem_prazo < datetime('now')
  AND sla_triagem_violado = 0
  AND deleted_at IS NULL;

-- 6. Índices de suporte às queries de SLA do cron
CREATE INDEX IF NOT EXISTS idx_sgso_relatos_sla_triagem
  ON sgso_relatos (empresa_id, status, sla_triagem_prazo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sgso_relatos_sla_investigacao
  ON sgso_relatos (empresa_id, status, sla_investigacao_prazo)
  WHERE deleted_at IS NULL;

-- 7. Tabela de configuração de SLA por empresa (permite customizar janelas)
CREATE TABLE IF NOT EXISTS sgso_sla_config (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id          INTEGER NOT NULL REFERENCES empresas(id),
  fase                TEXT    NOT NULL CHECK (fase IN ('TRIAGEM', 'INVESTIGACAO', 'RESOLUCAO')),
  horas_prazo         INTEGER NOT NULL DEFAULT 24,
  horas_alerta_previa INTEGER NOT NULL DEFAULT 4,
  ativo               INTEGER NOT NULL DEFAULT 1,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id, fase)
);

-- 8. Seed: SLAs padrão para todas as empresas ativas
INSERT OR IGNORE INTO sgso_sla_config (empresa_id, fase, horas_prazo, horas_alerta_previa)
SELECT id, 'TRIAGEM',      24, 4  FROM empresas WHERE deleted_at IS NULL AND ativo = 1;

INSERT OR IGNORE INTO sgso_sla_config (empresa_id, fase, horas_prazo, horas_alerta_previa)
SELECT id, 'INVESTIGACAO', 72, 12 FROM empresas WHERE deleted_at IS NULL AND ativo = 1;

INSERT OR IGNORE INTO sgso_sla_config (empresa_id, fase, horas_prazo, horas_alerta_previa)
SELECT id, 'RESOLUCAO',   168, 24 FROM empresas WHERE deleted_at IS NULL AND ativo = 1;
