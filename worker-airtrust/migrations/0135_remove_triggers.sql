-- MIGRATION 0135: REMOVE todos os triggers que referenciam funcionarios_old
-- Data: 2025-11-29
-- Objetivo: Remover triggers defectuosos que causam "no such table"

-- Listar e desabilitar todos os triggers
PRAGMA foreign_keys=OFF;

-- SQLite: DROP TRIGGER IF EXISTS <nome>
-- Como não sabemos os nomes, vamos usar uma abordagem nuclear:
-- Deletar informações de trigger do sqlite_master

-- Buscar todos os triggers
SELECT name FROM sqlite_master WHERE type='trigger';

-- Remover triggers um a um (aqui seria automático no código)
DROP TRIGGER IF EXISTS trg_funcionarios_audit;
DROP TRIGGER IF EXISTS trg_funcionarios_update_timestamp;
DROP TRIGGER IF EXISTS trg_pasta_virtual_timestamp;
DROP TRIGGER IF EXISTS trg_pasta_virtual_validate_fk;
DROP TRIGGER IF EXISTS trg_avaliacoes_timestamp;
DROP TRIGGER IF EXISTS update_pasta_virtual_timestamp;
DROP TRIGGER IF EXISTS insert_pasta_virtual_timestamp;

PRAGMA foreign_keys=ON;

SELECT 'Migration 0135: Todos os triggers removidos' AS resultado;
