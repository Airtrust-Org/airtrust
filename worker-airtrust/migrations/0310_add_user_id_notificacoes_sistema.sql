-- Migration 0310: Add user_id to notificacoes_sistema for per-user filtering
-- Allows ficha-flow notifications to be targeted to specific users
-- NULL user_id = global notification (visible to all)
-- Non-null user_id = only visible to that specific user

ALTER TABLE notificacoes_sistema ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notificacoes_user_id ON notificacoes_sistema(user_id, lida, created_at DESC);
