-- Migration: Remove prefixo "Seção X.X — " dos nomes das manobras de Examinador Prático
-- Descrição: As manobras da categoria EXAMINADOR-PRATICO (EXA-E01 e EXA-E02) tinham
--   nomes como "Seção 1.1 — Planejamento da sessão". Esta migration remove o prefixo
--   "Seção X.X — " mantendo apenas o nome descritivo.
-- Data: 2026-07-14

UPDATE manobras
SET nome = TRIM(SUBSTR(nome, INSTR(nome, ' — ') + 3)),
    updated_at = datetime('now')
WHERE nome LIKE 'Seção%'
  AND deleted_at IS NULL;

-- Validação: não deve haver mais manobras com nome iniciando com "Seção"
-- SELECT COUNT(*) FROM manobras WHERE nome LIKE 'Seção%' AND deleted_at IS NULL;
-- Esperado: 0
