-- CLEANUP SIMULADORES MODULE: Keep only Feb27-28 + Mar01 data
-- Sessions to keep: 30,31,32,33
-- Date: 2026-03-04

-- 1. Soft-delete fichas NOT in target sessions
UPDATE fichas_sessao SET deleted_at = datetime('now') WHERE id NOT IN (59,60,61,62,63,64,65,66,67) AND deleted_at IS NULL;

-- 2. Soft-delete fichas_sessao_manobras for deleted fichas
UPDATE fichas_sessao_manobras SET deleted_at = datetime('now') WHERE ficha_id NOT IN (59,60,61,62,63,64,65,66,67) AND deleted_at IS NULL;

-- 3. Soft-delete sessions NOT in target set
UPDATE simulador_agendamentos SET deleted_at = datetime('now') WHERE id NOT IN (30,31,32,33) AND deleted_at IS NULL;

-- 4. Soft-delete participantes NOT in target sessions
UPDATE sessoes_participantes SET deleted_at = datetime('now') WHERE sessao_id NOT IN (30,31,32,33) AND deleted_at IS NULL;

-- 5. Remove duplicate participants in sessions 30-33 (keep oldest id per funcionario_id+sessao_id+funcao)
UPDATE sessoes_participantes SET deleted_at = datetime('now')
WHERE id NOT IN (
  SELECT MIN(id) FROM sessoes_participantes
  WHERE sessao_id IN (30,31,32,33) AND deleted_at IS NULL
  GROUP BY sessao_id, funcionario_id, funcao
) AND sessao_id IN (30,31,32,33) AND deleted_at IS NULL;
