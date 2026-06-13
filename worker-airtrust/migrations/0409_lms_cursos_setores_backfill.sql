-- 0409_lms_cursos_setores_backfill.sql
-- Backfill: todos os cursos LMS existentes da empresa 6 recebem o setor Tripulação.
-- Usa subquery para obter setor_id por nome (não depende de ID fixo).

INSERT OR IGNORE INTO lms_cursos_setores (curso_id, setor_id, empresa_id)
SELECT
  c.id AS curso_id,
  s.id AS setor_id,
  c.empresa_id
FROM lms_cursos c
JOIN setores s
  ON UPPER(TRIM(s.nome)) = 'TRIPULAÇÃO'
 AND s.empresa_id = c.empresa_id
WHERE c.empresa_id = 6
  AND c.deleted_at IS NULL;
