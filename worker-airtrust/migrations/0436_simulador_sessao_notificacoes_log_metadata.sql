-- Migration 0436: metadata operacional para notificações de sessão de simulador
--
-- Objetivo:
--   - deduplicar avisos por destinatário/evento de sessão;
--   - registrar status/tentativas do canal oficial sem criar fila paralela;
--   - permitir reconciliação controlada de pendências após falha do provedor.
--
-- Escopo:
--   - aditivo sobre notificacoes_log;
--   - reutiliza a tabela oficial já tenant-scoped por empresa_id;
--   - não altera notificacoes_config nem cria novo serviço/outbox paralelo.

ALTER TABLE notificacoes_log ADD COLUMN funcionario_id INTEGER;
ALTER TABLE notificacoes_log ADD COLUMN sessao_id INTEGER;
ALTER TABLE notificacoes_log ADD COLUMN notification_key TEXT;
ALTER TABLE notificacoes_log ADD COLUMN tentativas_envio INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notificacoes_log ADD COLUMN provedor_mensagem_id TEXT;
ALTER TABLE notificacoes_log ADD COLUMN provedor_resultado TEXT;
-- SQLite/D1 não permite ADD COLUMN com default não constante. O Worker novo já
-- trata updated_at como opcional e o preenche somente quando a coluna existe.
ALTER TABLE notificacoes_log ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_notificacoes_log_sessao_id ON notificacoes_log(sessao_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_log_funcionario_id ON notificacoes_log(funcionario_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notificacoes_log_empresa_notification_key
  ON notificacoes_log(empresa_id, notification_key)
  WHERE notification_key IS NOT NULL AND empresa_id IS NOT NULL;
