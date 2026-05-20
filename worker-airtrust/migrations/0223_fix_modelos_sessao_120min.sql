-- Migration 0223: Corrigir duracao_estimada para 120 minutos em todos os modelos de sessão
UPDATE modelos_sessao
SET duracao_estimada = 120,
    updated_at = datetime('now')
WHERE deleted_at IS NULL;
