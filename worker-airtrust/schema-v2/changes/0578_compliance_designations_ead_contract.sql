-- 0578: tenant-6 mandatory designation EAD-to-LMS contract repair.
-- source_reference: owner-reported FDM committee omission 2026-11-11, production read-only 254-rule audit.
-- operational_decision: explicit EAD opt-in only for 9 existing condition rules with one published linked course.
-- Add separate EAD FDM_GATE (201) requirements for FDM_COMITE and GATEKEEPER; do not merge
-- with distinct operational qualification FDM-COMITE-GATEKEEPER (205).
-- dry_run_required: true; rollback_plan_required: governed forward-only correction / D1 Time Travel.
-- Does not insert LMS matriculas, issue certificates, alter historical evidence, or auto-approve classes.
UPDATE treinamento_requisitos
 SET auto_matricular_ead=1, modalidade_requerida='EAD',updated_at=datetime('now')
 WHERE empresa_id=6 AND id IN (587,656,657,658,659,660,669,674,705)
   AND ativo=1 AND deleted_at IS NULL AND obrigatoriedade='OBRIGATORIA'
   AND COALESCE(auto_matricular_ead,0) IN (0,1) AND modalidade_requerida IS NULL
   AND EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt
     WHERE qt.id=treinamento_requisitos.qualificacao_tipo_id
       AND qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL
       AND UPPER(TRIM(qt.categoria)) IN ('EAD','TREINAMENTO EAD')
   )
   AND 1=(SELECT COUNT(*) FROM lms_cursos lc
       WHERE lc.empresa_id=6 AND lc.qualificacao_tipo_id=treinamento_requisitos.qualificacao_tipo_id
         AND lc.ativo=1 AND lc.publicado=1 AND lc.deleted_at IS NULL);
INSERT INTO treinamento_requisitos
 (empresa_id,qualificacao_tipo_id,escopo,condicao_id,obrigatoriedade,
  modalidade_requerida,auto_matricular_ead,critico_operacional,
  origem,referencia_normativa,justificativa,validade_fonte,ativo,created_at,updated_at)
SELECT 6,qt.id,'EMPRESA',cc.id,'OBRIGATORIA',
 'EAD',1,0,'EMPRESA',
 'Treinamento FDM para comite e gatekeeper - designacoes ativas; vinculacao tecnica LMS 73',
 'Curso EAD FDM_GATE (201) nao substitui automaticamente a qualificacao operacional FDM-COMITE-GATEKEEPER (205).',
 'MODELO',1,datetime('now'),datetime('now')
FROM compliance_condicoes cc JOIN qualificacoes_tipos qt
  ON qt.empresa_id=cc.empresa_id AND qt.codigo='FDM_GATE' AND qt.ativo=1 AND qt.deleted_at IS NULL
WHERE cc.empresa_id=6 AND cc.codigo IN ('FDM_COMITE','GATEKEEPER') AND cc.tipo='DESIGNACAO'
  AND cc.ativo=1 AND cc.deleted_at IS NULL
  AND 1=(SELECT COUNT(*) FROM lms_cursos lc WHERE lc.empresa_id=6
     AND lc.id=73 AND lc.qualificacao_tipo_id=qt.id AND lc.ativo=1 AND lc.publicado=1 AND lc.deleted_at IS NULL)
  AND NOT EXISTS (SELECT 1 FROM treinamento_requisitos existing WHERE existing.empresa_id=6
    AND existing.condicao_id=cc.id AND existing.qualificacao_tipo_id=qt.id
    AND existing.ativo=1 AND existing.deleted_at IS NULL);
