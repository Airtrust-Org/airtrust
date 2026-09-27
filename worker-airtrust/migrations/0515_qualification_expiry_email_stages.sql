-- 0515_qualification_expiry_email_stages.sql
-- Adds governed e-mail stages for qualification expiry at 45 and 30 days.
-- source_reference: user-approved qualification expiry notification rule 2026-09-27: email employee + sector manager at 45 days and on entering expiry mode at 30 days.
-- operational_decision: keep notificacoes_config global by existing product contract; ensure 45d LOW and 30d MEDIUM EMAIL stages are active without deleting or rewriting other channels/stages.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/qualification-expiry-email-stages-0515.md

UPDATE notificacoes_config
   SET ativo = 1,
       updated_at = datetime('now')
 WHERE tipo = 'EMAIL'
   AND dias_antes = 45
   AND COALESCE(urgencia, '') = 'low'
   AND deleted_at IS NULL;

INSERT INTO notificacoes_config (tipo, ativo, dias_antes, urgencia, destinatarios, template)
SELECT
  'EMAIL',
  1,
  45,
  'low',
  NULL,
  'AVISO: Qualificação {{qualificacao}} de {{funcionario}} vence em {{dias}} dias. Programe a renovação.'
WHERE NOT EXISTS (
  SELECT 1
    FROM notificacoes_config
   WHERE tipo = 'EMAIL'
     AND dias_antes = 45
     AND COALESCE(urgencia, '') = 'low'
     AND deleted_at IS NULL
);

UPDATE notificacoes_config
   SET ativo = 1,
       updated_at = datetime('now')
 WHERE tipo = 'EMAIL'
   AND dias_antes = 30
   AND COALESCE(urgencia, '') = 'medium'
   AND deleted_at IS NULL;

INSERT INTO notificacoes_config (tipo, ativo, dias_antes, urgencia, destinatarios, template)
SELECT
  'EMAIL',
  1,
  30,
  'medium',
  NULL,
  'ALERTA: Qualificação {{qualificacao}} de {{funcionario}} entrou no período de vencimento e vence em {{dias}} dias. Providencie a renovação.'
WHERE NOT EXISTS (
  SELECT 1
    FROM notificacoes_config
   WHERE tipo = 'EMAIL'
     AND dias_antes = 30
     AND COALESCE(urgencia, '') = 'medium'
     AND deleted_at IS NULL
);
