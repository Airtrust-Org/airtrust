-- ==========================================
-- MIGRATION 0173: Adicionar Status em Qualificações
-- Data: 2026-01-08
-- Objetivo: Adaptar qualificacoes_historico para suportar planejamento futuro
-- ==========================================

-- Adicionar campos de status e confirmação
ALTER TABLE qualificacoes_historico ADD COLUMN status TEXT DEFAULT 'CONCLUIDA' 
  CHECK(status IN ('PLANEJADA', 'CONCLUIDA', 'CANCELADA'));

ALTER TABLE qualificacoes_historico ADD COLUMN data_confirmacao TEXT;

ALTER TABLE qualificacoes_historico ADD COLUMN confirmada_por INTEGER;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_qualificacoes_status 
  ON qualificacoes_historico(status) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_planejadas_vencidas 
  ON qualificacoes_historico(data_conclusao, status) 
  WHERE status = 'PLANEJADA' AND deleted_at IS NULL;

-- Adicionar trigger para updated_at
CREATE TRIGGER IF NOT EXISTS trg_qualificacoes_historico_updated_at
AFTER UPDATE ON qualificacoes_historico
FOR EACH ROW
BEGIN
  UPDATE qualificacoes_historico 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;
