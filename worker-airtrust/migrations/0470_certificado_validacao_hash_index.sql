-- 0470 — Índice persistido para validação pública de certificados
--
-- Elimina a necessidade de recalcular SHA-256 sobre todo o histórico a cada
-- validação pública. O valor continua sendo o token legado de 16 hex já impresso
-- nos certificados/QR codes; esta migration não muda o contrato público.
--
-- O backfill de registros históricos é uma operação governada separada: esta
-- mudança é somente aditiva e não escreve hashes derivados em linhas existentes.

ALTER TABLE qualificacoes_historico
  ADD COLUMN validacao_hash TEXT
  CHECK (validacao_hash IS NULL OR (length(validacao_hash) = 16 AND validacao_hash = upper(validacao_hash)));

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_validacao_hash
  ON qualificacoes_historico (validacao_hash)
  WHERE validacao_hash IS NOT NULL AND deleted_at IS NULL;
