-- Rollback for migration 0456.
-- Governed execution only, after backup and confirmation that no runtime relies
-- on h5p_conteudo_id. The historical exact-r2_key compatibility join remains.

DROP INDEX IF EXISTS idx_lms_cursos_h5p_conteudo;
DROP INDEX IF EXISTS ux_lms_cursos_h5p_conteudo_active;
ALTER TABLE lms_cursos DROP COLUMN h5p_conteudo_id;
