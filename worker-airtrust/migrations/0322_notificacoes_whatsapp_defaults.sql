-- =============================================
-- MIGRATION: Configuracoes padrao de notificacoes por WhatsApp
-- Data: 01/04/2026
-- Descricao: adiciona canais WHATSAPP padrao ao sistema de notificacoes
-- =============================================

INSERT INTO notificacoes_config (tipo, ativo, dias_antes, urgencia, destinatarios, template)
SELECT 'WHATSAPP', 1, 7, 'critical', NULL,
       'AirTrust: a qualificacao {{qualificacao}} de {{funcionario}} vence em {{dias}} dias ({{data_vencimento}}).'
WHERE NOT EXISTS (
  SELECT 1
    FROM notificacoes_config
   WHERE tipo = 'WHATSAPP'
     AND dias_antes = 7
     AND COALESCE(urgencia, '') = 'critical'
     AND deleted_at IS NULL
);

INSERT INTO notificacoes_config (tipo, ativo, dias_antes, urgencia, destinatarios, template)
SELECT 'WHATSAPP', 1, 15, 'high', NULL,
       'AirTrust: a qualificacao {{qualificacao}} de {{funcionario}} vence em {{dias}} dias ({{data_vencimento}}).'
WHERE NOT EXISTS (
  SELECT 1
    FROM notificacoes_config
   WHERE tipo = 'WHATSAPP'
     AND dias_antes = 15
     AND COALESCE(urgencia, '') = 'high'
     AND deleted_at IS NULL
);

INSERT INTO notificacoes_config (tipo, ativo, dias_antes, urgencia, destinatarios, template)
SELECT 'WHATSAPP', 1, 30, 'medium', NULL,
       'AirTrust: a qualificacao {{qualificacao}} de {{funcionario}} vence em {{dias}} dias ({{data_vencimento}}).'
WHERE NOT EXISTS (
  SELECT 1
    FROM notificacoes_config
   WHERE tipo = 'WHATSAPP'
     AND dias_antes = 30
     AND COALESCE(urgencia, '') = 'medium'
     AND deleted_at IS NULL
);