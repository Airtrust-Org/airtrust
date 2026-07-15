-- Migration: Remove prefixo "INV-XXX-NN — " dos nomes das manobras de Instrutor Prático
-- Descrição: As manobras da categoria INSTRUTOR-PRATICO (INST-E01 e INST-E02) tinham
--   nomes como "INV-PLN-01 — Planejamento e objetivos". O código real está no campo
--   `codigo` (INST-E01-01, etc.). Esta migration remove o prefixo redundante do nome.
-- Data: 2026-07-14

UPDATE manobras
SET nome = TRIM(SUBSTR(nome, INSTR(nome, ' — ') + 3)),
    updated_at = datetime('now')
WHERE categoria = 'INSTRUTOR-PRATICO'
  AND nome LIKE 'INV-% — %'
  AND deleted_at IS NULL;

-- Validação: não deve haver mais manobras INSTRUTOR-PRATICO com prefixo INV- no nome
-- SELECT COUNT(*) FROM manobras WHERE categoria = 'INSTRUTOR-PRATICO' AND nome LIKE 'INV-%' AND deleted_at IS NULL;
-- Esperado: 0
