-- Restauração emergencial do módulo de simuladores
-- Data: 2026-03-04
-- Objetivo: reativar registros que foram soft-deletados e reaparecer fichas/modelos/manobras relacionados

-- 1) Reativar cadastros-base do módulo
UPDATE tipos_sessao
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE simuladores
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE manobras
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE modelos_sessao
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE modelos_sessao_manobras
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

-- 2) Reativar sessões e vínculos
UPDATE simulador_agendamentos
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE sessoes_participantes
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE sessoes_checks
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

-- 3) Reativar fichas
UPDATE fichas_sessao
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

UPDATE fichas_sessao_manobras
SET deleted_at = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL;

-- 4) Garantir empresa_id nas sessões reativadas
UPDATE simulador_agendamentos
SET empresa_id = (
  SELECT f.empresa_id
  FROM funcionarios f
  WHERE f.id = simulador_agendamentos.instrutor_id
    AND f.empresa_id IS NOT NULL
  LIMIT 1
)
WHERE empresa_id IS NULL;

UPDATE simulador_agendamentos
SET empresa_id = (SELECT MIN(id) FROM empresas WHERE deleted_at IS NULL LIMIT 1)
WHERE empresa_id IS NULL;

-- 5) Auditoria final pós-restauração
SELECT 'simulador_agendamentos' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM simulador_agendamentos;
SELECT 'sessoes_participantes' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM sessoes_participantes;
SELECT 'fichas_sessao' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM fichas_sessao;
SELECT 'fichas_sessao_manobras' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM fichas_sessao_manobras;
SELECT 'modelos_sessao' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM modelos_sessao;
SELECT 'modelos_sessao_manobras' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM modelos_sessao_manobras;
SELECT 'tipos_sessao' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM tipos_sessao;
SELECT 'simuladores' tabela, COUNT(*) total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) deletados FROM simuladores;
