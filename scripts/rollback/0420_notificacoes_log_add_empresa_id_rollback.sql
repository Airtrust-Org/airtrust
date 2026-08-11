-- ROLLBACK 0420: remove empresa_id de notificacoes_log
-- Seguro para rerun: DROP COLUMN falha (sem corromper dado) se já foi revertido.
--
-- D1/SQLite (>= 3.35) suportam ALTER TABLE ... DROP COLUMN para colunas simples
-- sem constraint UNIQUE/CHECK/PK — este é exatamente esse caso (INTEGER, sem
-- REFERENCES, sem índice UNIQUE). O índice idx_notificacoes_log_empresa_id é
-- removido junto automaticamente pelo DROP COLUMN; o DROP INDEX abaixo é apenas
-- defensivo caso o índice tenha sido recriado manualmente depois.

DROP INDEX IF EXISTS idx_notificacoes_log_empresa_id;
ALTER TABLE notificacoes_log DROP COLUMN empresa_id;
