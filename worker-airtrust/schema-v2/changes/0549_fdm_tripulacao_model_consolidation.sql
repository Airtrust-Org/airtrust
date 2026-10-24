-- Schema V2 0549: consolidate the tenant-6 FDM Tripulação legacy model into FDM_TRIP.
-- Preserves the published SCORM course (#71), 11 enrollment states, 9 completion records,
-- and the two function-scoped training requirements. The unpublished empty course #74 remains
-- untouched because it is already correctly bound to FDM_TRIP.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/fdm-tripulacao-model-consolidation-0549.md

SELECT json(CASE WHEN
  (SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM qualificacoes_tipos
    WHERE empresa_id=6 AND codigo='FDM_TRIP' AND ativo=1 AND deleted_at IS NULL)=1
  AND (SELECT COUNT(*) FROM qualificacoes_historico h
    JOIN qualificacoes_tipos q ON q.id=h.qualificacao_id AND q.empresa_id=h.empresa_id
    WHERE h.empresa_id=6 AND h.deleted_at IS NULL AND q.codigo='FDM-TRIPULACAO')=9
  AND (SELECT COUNT(*) FROM qualificacoes_historico h
    JOIN qualificacoes_tipos q ON q.id=h.qualificacao_id AND q.empresa_id=h.empresa_id
    WHERE h.empresa_id=6 AND h.deleted_at IS NULL AND q.codigo='FDM_TRIP')=0
  AND (SELECT COUNT(*) FROM lms_cursos c
    JOIN qualificacoes_tipos q ON q.id=c.qualificacao_tipo_id AND q.empresa_id=c.empresa_id
    WHERE c.empresa_id=6 AND c.id=71 AND c.ativo=1 AND c.publicado=1
      AND c.deleted_at IS NULL AND LOWER(c.tipo_conteudo)='scorm'
      AND c.gerar_qualificacao_ao_concluir=1 AND q.codigo='FDM-TRIPULACAO')=1
  AND (SELECT COUNT(*) FROM lms_matriculas m
    WHERE m.empresa_id=6 AND m.curso_id=71 AND m.deleted_at IS NULL)=11
  AND (SELECT COUNT(*) FROM lms_matriculas m
    WHERE m.empresa_id=6 AND m.curso_id=71 AND m.deleted_at IS NULL AND m.status='CONCLUIDO')=9
  AND (SELECT COUNT(*) FROM lms_matriculas m
    WHERE m.empresa_id=6 AND m.curso_id=71 AND m.deleted_at IS NULL AND m.status<>'CONCLUIDO')=2
  AND (SELECT COUNT(*) FROM lms_cursos c
    JOIN qualificacoes_tipos q ON q.id=c.qualificacao_tipo_id AND q.empresa_id=c.empresa_id
    WHERE c.empresa_id=6 AND c.id=74 AND c.ativo=1 AND c.publicado=0
      AND c.deleted_at IS NULL AND q.codigo='FDM_TRIP')=1
  AND (SELECT COUNT(*) FROM lms_matriculas
    WHERE empresa_id=6 AND curso_id=74 AND deleted_at IS NULL)=0
  AND (SELECT COUNT(*) FROM treinamento_requisitos tr
    JOIN qualificacoes_tipos q ON q.id=tr.qualificacao_tipo_id AND q.empresa_id=tr.empresa_id
    WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND q.codigo='FDM-TRIPULACAO')=2
  AND (SELECT COUNT(*) FROM treinamento_requisitos tr
    JOIN qualificacoes_tipos q ON q.id=tr.qualificacao_tipo_id AND q.empresa_id=tr.empresa_id
    WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND q.codigo='FDM_TRIP')=0
  AND (SELECT COUNT(*) FROM treinamentos_planejados p
    JOIN qualificacoes_tipos q ON q.id=p.qualificacao_tipo_id AND q.empresa_id=p.empresa_id
    WHERE p.empresa_id=6 AND p.deleted_at IS NULL AND q.codigo='FDM-TRIPULACAO')=0
  AND (SELECT COUNT(*) FROM matriz_treinamento_funcao m
    JOIN qualificacoes_tipos q ON q.id=m.qualificacao_tipo_id AND q.empresa_id=m.empresa_id
    WHERE m.empresa_id=6 AND m.deleted_at IS NULL AND q.codigo='FDM-TRIPULACAO')=0
THEN 'null' ELSE 'FDM_TRIPULACAO_MODEL_CONSOLIDATION_0549_PREFLIGHT_REJECTED' END);

UPDATE qualificacoes_historico
   SET qualificacao_id=(SELECT id FROM qualificacoes_tipos
                         WHERE empresa_id=6 AND codigo='FDM_TRIP' AND ativo=1 AND deleted_at IS NULL),
       qualificacao_codigo='FDM_TRIP',
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND deleted_at IS NULL
   AND qualificacao_id=(SELECT id FROM qualificacoes_tipos
                          WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL);

UPDATE lms_cursos
   SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos
                              WHERE empresa_id=6 AND codigo='FDM_TRIP' AND ativo=1 AND deleted_at IS NULL),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND id=71 AND ativo=1 AND publicado=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos
                               WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL);

UPDATE treinamento_requisitos
   SET qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos
                              WHERE empresa_id=6 AND codigo='FDM_TRIP' AND ativo=1 AND deleted_at IS NULL),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
   AND qualificacao_tipo_id=(SELECT id FROM qualificacoes_tipos
                              WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL);

UPDATE qualificacoes_tipos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL;
