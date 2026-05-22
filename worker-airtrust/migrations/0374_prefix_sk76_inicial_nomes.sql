-- Migration 0374: Prefixar "SK76 - " nos nomes dos modelos de sessão INICIAL do SK76
-- Exemplo: "01/12 - FAMILIARIZAÇÃO VFR..." → "SK76 - 01/12 - FAMILIARIZAÇÃO VFR..."

UPDATE modelos_sessao
SET nome = 'SK76 - ' || nome,
    updated_at = datetime('now')
WHERE modelo_aeronave = 'SK76'
  AND tipo = 'INICIAL'
  AND deleted_at IS NULL
  AND nome NOT LIKE 'SK76 - %';
