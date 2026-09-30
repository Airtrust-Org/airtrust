-- 0521_training_compliance_designation_overrides.sql
-- Reusable inclusion/exclusion overrides through Compliance conditions/designations.
-- Configures Costa do Sol RBAC 119 management CRM applicability without inferring employees.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-compliance-designation-overrides-0521.md

-- RBAC 119.69 required management positions for the current Costa do Sol operating context.
-- Definitions only: no employee assignment is inferred by migration.
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'RBAC119_GESTOR_RESPONSAVEL','RBAC 119 — Gestor Responsável','DESIGNACAO',
       'Ocupante formal da função de Gestor Responsável requerida/aprovada pelo RBAC 119.',
       'RBAC 119.69; IS 00-010B 5.3.5' FROM empresas WHERE id=6;

INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'RBAC119_GERENTE_OPERACOES','RBAC 119 — Diretor/Gerente de Operações','DESIGNACAO',
       'Ocupante formal da função de Diretor ou Gerente de Operações requerida/aprovada pelo RBAC 119.',
       'RBAC 119.69; IS 00-010B 5.3.5' FROM empresas WHERE id=6;

INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'RBAC119_PILOTO_CHEFE','RBAC 119 — Piloto Chefe','DESIGNACAO',
       'Ocupante formal da função de Piloto Chefe requerida/aprovada pelo RBAC 119.',
       'RBAC 119.69; IS 00-010B 5.3.5' FROM empresas WHERE id=6;

INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'RBAC119_GERENTE_MANUTENCAO','RBAC 119 — Diretor/Gerente de Manutenção','DESIGNACAO',
       'Ocupante formal da função de Diretor ou Gerente de Manutenção requerida/aprovada pelo RBAC 119.',
       'RBAC 119.69; IS 00-010B 5.3.5' FROM empresas WHERE id=6;
INSERT OR IGNORE INTO compliance_condicoes(empresa_id,codigo,nome,tipo,descricao,referencia_normativa)
SELECT id,'RBAC119_GERENTE_SEGURANCA_OPERACIONAL','RBAC 119 — Diretor/Gerente de Segurança Operacional','DESIGNACAO',
       'Ocupante formal da função de Diretor ou Gerente de Segurança Operacional requerida/aprovada pelo RBAC 119.',
       'RBAC 119.69; IS 00-010B 5.3.5' FROM empresas WHERE id=6;

-- For every RBAC 119 management designation, the dedicated 4 h EaD CRM is mandatory.
INSERT INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,condicao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,modalidade_requerida,fundamento_tipo,
  fundamento_documento,fundamento_item,validade_fonte,observacoes,auto_matricular_ead,ativo
)
SELECT 6, qt.id, 'EMPRESA', cc.id, 'OBRIGATORIA', 1,
       'REGULATORIO','RBAC 119.69; IS 00-010B 5.3.5',
       'Aplicável ao ocupante formal de cargo de direção requerido/aprovado pelo RBAC 119.',
       'EAD','DESIGNACAO','RBAC 119 / IS 00-010B','5.3.5','MODELO',
       'CRM específico de nível estratégico/tático para cargo de direção RBAC 119.',0,1
  FROM qualificacoes_tipos qt
  JOIN compliance_condicoes cc ON cc.empresa_id=6 AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_DIR_RBAC119' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.codigo IN (
     'RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_PILOTO_CHEFE',
     'RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL'
   )
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id AND tr.escopo='EMPRESA'
        AND tr.condicao_id=cc.id AND tr.ativo=1 AND tr.deleted_at IS NULL
   );
-- The same designation explicitly excludes the generic CRM Corporate requirement.
INSERT INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,condicao_id,obrigatoriedade,critico_operacional,
  origem,referencia_normativa,justificativa,fundamento_tipo,fundamento_documento,
  fundamento_item,validade_fonte,observacoes,auto_matricular_ead,ativo
)
SELECT 6, qt.id, 'EMPRESA', cc.id, 'NAO_APLICA', 0,
       'EMPRESA','RBAC 119.69; IS 00-010B 5.3.5',
       'Exclusão do CRM Corporate porque a pessoa ocupa cargo de direção RBAC 119 e recebe o CRM específico de direção.',
       'PADRAO_EXCLUSAO','RBAC 119 / IS 00-010B','5.3.5','MODELO',
       'Override auditável: mantém a regra geral da empresa, mas exclui o ocupante designado.',0,1
  FROM qualificacoes_tipos qt
  JOIN compliance_condicoes cc ON cc.empresa_id=6 AND cc.ativo=1 AND cc.deleted_at IS NULL
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND cc.codigo IN (
     'RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_PILOTO_CHEFE',
     'RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL'
   )
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id AND tr.escopo='EMPRESA'
        AND tr.condicao_id=cc.id AND tr.ativo=1 AND tr.deleted_at IS NULL
   );

-- No employee assignment is inserted here. Selection remains an explicit audited user action
-- in funcionarios_compliance_condicoes, so job-title text never grants or removes obligations.