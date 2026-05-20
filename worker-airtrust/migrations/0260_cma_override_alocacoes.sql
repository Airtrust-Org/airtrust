-- Add CMA override tracking to escala_alocacoes
-- Allows operators to explicitly override a blocked CMA with accountability
ALTER TABLE escala_alocacoes ADD COLUMN cma_override INTEGER NOT NULL DEFAULT 0;
ALTER TABLE escala_alocacoes ADD COLUMN cma_override_by TEXT NULL;
