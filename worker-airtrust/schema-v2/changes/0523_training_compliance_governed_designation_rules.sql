-- 0523_training_compliance_governed_designation_rules.sql
-- Restores and hardens condition-based regulatory Training Compliance rules after manual API deletion.
-- source_reference: production audit 2026-09-30 identified four CRM Corporate RBAC 119 exclusion rules soft-deleted through the generic Compliance API after Schema V2 0521.
-- operational_decision: preserve explicit employee designations, restore only the five reviewed RBAC 119 rule identities, and mark them regulatory so generic editors can treat them as governed definitions.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-governed-designation-rules-0523.md

-- Normalize the dedicated management CRM rules as governed designation rules.
UPDATE treinamento_requisitos
   SET origem='REGULATORIO',
       fundamento_tipo='DESIGNACAO',
       fundamento_documento='RBAC 119 / IS 00-010B',
       fundamento_item='5.3.5',
       referencia_normativa='RBAC 119.69; IS 00-010B 5.3.5',
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='CRM_DIR_RBAC119' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   )
   AND condicao_id IN (
     SELECT id FROM compliance_condicoes
      WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
        AND codigo IN (
          'RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_PILOTO_CHEFE',
          'RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL'
        )
   )
   AND obrigatoriedade='OBRIGATORIA';

-- Restore the five reviewed exclusions without touching the company-wide CRM Corporate rule,
-- any employee assignment, historical evidence, enrollment, or unrelated applicability rule.
UPDATE treinamento_requisitos
   SET obrigatoriedade='NAO_APLICA',
       critico_operacional=0,
       origem='REGULATORIO',
       referencia_normativa='RBAC 119.69; IS 00-010B 5.3.5',
       justificativa='Exclusão do CRM Corporate porque a pessoa ocupa cargo de direção RBAC 119 e recebe o CRM específico de direção.',
       fundamento_tipo='PADRAO_EXCLUSAO',
       fundamento_documento='RBAC 119 / IS 00-010B',
       fundamento_item='5.3.5',
       validade_fonte='MODELO',
       observacoes='Override auditável: mantém a regra geral da empresa, mas exclui o ocupante designado.',
       auto_matricular_ead=0,
       ativo=1,
       deleted_at=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND qualificacao_tipo_id=(
     SELECT id FROM qualificacoes_tipos
      WHERE empresa_id=6 AND codigo='CRM_CORP' AND ativo=1 AND deleted_at IS NULL LIMIT 1
   )
   AND condicao_id IN (
     SELECT id FROM compliance_condicoes
      WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL
        AND codigo IN (
          'RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_PILOTO_CHEFE',
          'RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL'
        )
   )
   AND fundamento_tipo='PADRAO_EXCLUSAO';
