-- ================================================================
-- Migration 0243: suporte a múltiplos consumidores em domain_events
-- ================================================================

ALTER TABLE domain_events ADD COLUMN consumidores TEXT DEFAULT '[]';
ALTER TABLE domain_events ADD COLUMN processado_por TEXT DEFAULT '[]';
ALTER TABLE domain_events ADD COLUMN ultimo_erro TEXT;

UPDATE domain_events
SET consumidores = COALESCE(consumidores, '[]'),
    processado_por = COALESCE(processado_por, '[]')
WHERE consumidores IS NULL OR processado_por IS NULL;

CREATE INDEX IF NOT EXISTS idx_domain_events_empresa_created
  ON domain_events(empresa_id, created_at);
