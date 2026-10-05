-- 0532_training_compliance_fdm_designation_only.sql
-- Forward-only correction: FDM-EAD is designation-only for tenant 6.
-- source_reference: Training Manager decision confirmed 2026-10-05; FDM/LOSA/eDB specific programs require formal designation.
-- operational_decision: remove broad organizational FDM-EAD obligations and preserve/create only the FDM_EQUIPE designation rule.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-fdm-designation-only-0532.md

UPDATE treinamento_requisitos
   SET ativo=0,
       deleted_at=COALESCE(deleted_at,datetime('now')),
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND ativo=1
   AND deleted_at IS NULL
   AND qualificacao_tipo_id=(
     SELECT id
       FROM qualificacoes_tipos
      WHERE empresa_id=6
        AND UPPER(codigo)='FDM-EAD'
        AND ativo=1
        AND deleted_at IS NULL
      LIMIT 1
   )
   AND (
     condicao_id IS NULL
     OR condicao_id<>(
       SELECT id
         FROM compliance_condicoes
        WHERE empresa_id=6
          AND UPPER(codigo)='FDM_EQUIPE'
          AND ativo=1
          AND deleted_at IS NULL
        LIMIT 1
     )
   );

INSERT OR IGNORE INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,condicao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  validade_fonte,auto_matricular_ead,ativo,observacoes,created_at,updated_at
)
SELECT 6,qt.id,'EMPRESA',cc.id,'OBRIGATORIA',0,
       'SGSO','MNL-SSO-002',
       'Aplicável somente a integrante formalmente designado para a equipe FDM/HFDM.',
       'DESIGNACAO','MNL-SSO-002',
       'EVIDENCIA',0,1,
       'Alinhamento governado 0532: FDM-EAD somente por designação FDM_EQUIPE.',
       datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
  JOIN compliance_condicoes cc
    ON cc.empresa_id=6
   AND UPPER(cc.codigo)='FDM_EQUIPE'
   AND cc.ativo=1
   AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6
   AND UPPER(qt.codigo)='FDM-EAD'
   AND qt.ativo=1
   AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6
        AND tr.qualificacao_tipo_id=qt.id
        AND tr.condicao_id=cc.id
        AND tr.ativo=1
        AND tr.deleted_at IS NULL
   );
