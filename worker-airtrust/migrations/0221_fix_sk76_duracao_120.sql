-- Migration 0221: Corrigir duração dos modelos iniciais SK76 para 120 minutos

UPDATE modelos_sessao
SET duracao_estimada = 120,
    updated_at = datetime('now')
WHERE codigo IN ('SK76-I-01/03', 'SK76-I-02/03', 'SK76-I-03/03')
  AND deleted_at IS NULL;
