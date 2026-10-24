-- Schema V2 0553: retire the empty tenant-6 LGPD placeholder model.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/retire-empty-lgpd-seg-info-model-0553.md

SELECT json(CASE WHEN
  (SELECT COUNT(*) FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='LGPD_SEG_INFO' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM qualificacoes_historico h JOIN qualificacoes_tipos q ON q.id=h.qualificacao_id AND q.empresa_id=h.empresa_id WHERE h.empresa_id=6 AND h.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO')=0
  AND (SELECT COUNT(*) FROM lms_cursos c JOIN qualificacoes_tipos q ON q.id=c.qualificacao_tipo_id AND q.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO')=0
  AND (SELECT COUNT(*) FROM treinamento_requisitos tr JOIN qualificacoes_tipos q ON q.id=tr.qualificacao_tipo_id AND q.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO')=0
  AND (SELECT COUNT(*) FROM matriz_treinamento_funcao m JOIN qualificacoes_tipos q ON q.id=m.qualificacao_tipo_id AND q.empresa_id=m.empresa_id WHERE m.empresa_id=6 AND m.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO')=0
  AND (SELECT COUNT(*) FROM treinamentos_planejados p JOIN qualificacoes_tipos q ON q.id=p.qualificacao_tipo_id AND q.empresa_id=p.empresa_id WHERE p.empresa_id=6 AND p.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO')=0
  AND (SELECT COUNT(*) FROM qualificacoes_tipos_setores s JOIN qualificacoes_tipos q ON q.id=s.tipo_id AND q.empresa_id=s.empresa_id WHERE s.empresa_id=6 AND s.deleted_at IS NULL AND q.codigo='LGPD_SEG_INFO')=0
THEN 'null' ELSE 'RETIRE_EMPTY_LGPD_SEG_INFO_0553_PREFLIGHT_REJECTED' END);

UPDATE qualificacoes_tipos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='LGPD_SEG_INFO' AND ativo=1 AND deleted_at IS NULL;
