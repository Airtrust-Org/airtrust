-- Migração: Corrigir registros com id NULL em qualificacoes_tipos
-- Data: 2025-11-27
-- Descrição: Alguns registros foram criados com id NULL, quebrando DELETEs e UPDATEs

-- 1. Gerar IDs únicos para registros com id NULL
UPDATE qualificacoes_tipos
SET id = 'tipo-fix-' || lower(hex(randomblob(8)))
WHERE id IS NULL AND deleted_at IS NULL;

-- 2. Verificar se ainda existem registros sem ID
-- SELECT COUNT(*) as registros_sem_id FROM qualificacoes_tipos WHERE id IS NULL AND deleted_at IS NULL;
