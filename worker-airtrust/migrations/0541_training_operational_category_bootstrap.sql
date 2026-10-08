-- 0541_training_operational_category_bootstrap.sql
-- Forward-only, tenant-scoped catalog prerequisite for governed FDM 0536.
-- Production read-only evidence (2026-10-07): 0535 applied, 0536 unapplied,
-- no category TREINAMENTO_OPERACIONAL; staging has this canonical category.
-- No employee, enrollment, course, qualification-history, certificate or R2 writes.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/training-operational-category-bootstrap-0541.md

INSERT INTO qualificacoes_categorias
  (empresa_id,nome,codigo,cor,descricao,ativo,dominio_codigo,lms_integrada,created_at,updated_at)
SELECT 6,'Treinamentos Operacionais','TREINAMENTO_OPERACIONAL','#6B7280',
       NULL,1,NULL,0,datetime('now'),datetime('now')
 WHERE NOT EXISTS (
   SELECT 1 FROM qualificacoes_categorias
    WHERE empresa_id=6
      AND (UPPER(TRIM(codigo))='TREINAMENTO_OPERACIONAL'
           OR UPPER(TRIM(nome))='TREINAMENTOS OPERACIONAIS')
 );
