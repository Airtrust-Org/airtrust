-- MIGRATION 0137: Add integrity checks to documentos
-- Data: 2025-11-29
-- Objetivo: Adicionar checksum SHA-256 para verificar integridade dos PDFs

-- Adicionar coluna de hash SHA-256 se não existir
ALTER TABLE documentos ADD COLUMN sha256_hash TEXT;

-- Criar índice no hash para buscar rápido por integridade
CREATE INDEX IF NOT EXISTS idx_documentos_sha256 ON documentos(sha256_hash);

-- Log
INSERT INTO logs_migracao (numero_migracao, descricao, data_execucao, sucesso)
VALUES (137, 'Add integrity checks to documentos', datetime('now'), 1);
