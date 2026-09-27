-- 0516_qualification_expired_daily_alerts.sql
-- Makes qualification e-mail stages tenant-configurable and adds daily expired alerts.
-- source_reference: user-approved alert configuration rules 2026-09-27.
-- operational_decision: global rows remain product defaults; tenant rows override by codigo+tipo.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/qualification-expired-daily-alerts-0516.md

ALTER TABLE notificacoes_config ADD COLUMN empresa_id INTEGER;
ALTER TABLE notificacoes_config ADD COLUMN codigo TEXT;
ALTER TABLE notificacoes_config ADD COLUMN assunto_template TEXT;
ALTER TABLE notificacoes_config ADD COLUMN frequencia TEXT NOT NULL DEFAULT 'ONCE';
ALTER TABLE notificacoes_config ADD COLUMN intervalo_dias INTEGER;

CREATE INDEX IF NOT EXISTS idx_notificacoes_config_empresa
  ON notificacoes_config(empresa_id, tipo, ativo) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notificacoes_config_tenant_codigo_tipo
  ON notificacoes_config(empresa_id, codigo, tipo)
  WHERE empresa_id IS NOT NULL AND codigo IS NOT NULL AND deleted_at IS NULL;

UPDATE notificacoes_config
   SET codigo = CASE
         WHEN tipo = 'EMAIL' AND dias_antes = 45 AND COALESCE(urgencia, '') = 'low' THEN 'QUALIFICACAO_45D'
         WHEN tipo = 'EMAIL' AND dias_antes = 30 AND COALESCE(urgencia, '') = 'medium' THEN 'QUALIFICACAO_30D'
         WHEN tipo = 'EMAIL' AND dias_antes = 15 AND COALESCE(urgencia, '') = 'high' THEN 'QUALIFICACAO_15D'
         WHEN tipo = 'EMAIL' AND dias_antes = 7 AND COALESCE(urgencia, '') = 'critical' THEN 'QUALIFICACAO_7D'
         ELSE codigo
       END,
       frequencia = COALESCE(NULLIF(frequencia, ''), 'ONCE'),
       updated_at = datetime('now')
 WHERE empresa_id IS NULL AND deleted_at IS NULL;

UPDATE notificacoes_config
   SET ativo = 1,
       template = 'ALERTA: Qualificação {{qualificacao}} de {{funcionario}} entrou no período de vencimento e vence em {{dias}} dias. Providencie a renovação.',
       assunto_template = '📅 Alerta: Qualificação {{qualificacao}} expirando em {{dias}} dias',
       frequencia = 'ONCE',
       updated_at = datetime('now')
 WHERE empresa_id IS NULL AND tipo = 'EMAIL' AND codigo = 'QUALIFICACAO_30D' AND deleted_at IS NULL;

UPDATE notificacoes_config
   SET assunto_template = CASE codigo
         WHEN 'QUALIFICACAO_45D' THEN '📅 Alerta: Qualificação {{qualificacao}} expirando em {{dias}} dias'
         WHEN 'QUALIFICACAO_15D' THEN '⚠️ Alerta: Qualificação {{qualificacao}} expirando em {{dias}} dias'
         WHEN 'QUALIFICACAO_7D' THEN '🚨 Alerta: Qualificação {{qualificacao}} expirando em {{dias}} dias'
         ELSE assunto_template
       END,
       frequencia = 'ONCE',
       updated_at = datetime('now')
 WHERE empresa_id IS NULL
   AND tipo = 'EMAIL'
   AND codigo IN ('QUALIFICACAO_45D', 'QUALIFICACAO_15D', 'QUALIFICACAO_7D')
   AND deleted_at IS NULL;

INSERT INTO notificacoes_config
  (tipo, ativo, dias_antes, urgencia, destinatarios, template, empresa_id, codigo, assunto_template, frequencia, intervalo_dias)
SELECT
  'EMAIL', 1, 0, 'expired', NULL,
  'URGENTE: Qualificação {{qualificacao}} de {{funcionario}} está vencida há {{dias_vencida}} {{unidade_dias_vencida}}. Data de vencimento: {{data_vencimento}}. Regularize imediatamente.',
  NULL, 'QUALIFICACAO_VENCIDA',
  '🚨 Qualificação vencida: {{qualificacao}} — há {{dias_vencida}} {{unidade_dias_vencida}}',
  'DAILY', 1
WHERE NOT EXISTS (
  SELECT 1 FROM notificacoes_config
   WHERE empresa_id IS NULL
     AND tipo = 'EMAIL'
     AND codigo = 'QUALIFICACAO_VENCIDA'
     AND deleted_at IS NULL
);
