-- 0543: tenant 6, strictly correct FDM #71/#72 qualification IDs only.
-- source_reference: FDM13 preflight run 37835816744 and user authorization 2026-10-08.
-- dry_run_required: validated governed production preflight; rollback_plan_required: schema-v2 plan.
-- No matrícula, SCORM, grade, certificate, historical, #13 or #73 write.
UPDATE lms_cursos SET qualificacao_tipo_id=(
 SELECT qt.id FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-TRIPULACAO' AND qt.ativo=1 AND qt.deleted_at IS NULL
) WHERE id=71 AND empresa_id=6 AND ativo=1 AND publicado=1 AND deleted_at IS NULL AND tipo_conteudo='scorm';

UPDATE lms_cursos SET qualificacao_tipo_id=(
 SELECT qt.id FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='FDM-MECANICO' AND qt.ativo=1 AND qt.deleted_at IS NULL
) WHERE id=72 AND empresa_id=6 AND ativo=1 AND publicado=1 AND deleted_at IS NULL AND tipo_conteudo='scorm';
