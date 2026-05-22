-- Migration 0377: Adicionar "- INICIAL -" nos nomes das sessões INICIAL do SK76 e AW139
-- Antes: "SK76 - 01/12 - FAMILIARIZAÇÃO..." → "SK76 - INICIAL - 01/12 - FAMILIARIZAÇÃO..."
-- Antes: "AW139 - 01/12: FAMILIARIZAÇÃO"  → "AW139 - INICIAL - 01/12: FAMILIARIZAÇÃO"

UPDATE modelos_sessao
SET nome = 'SK76 - INICIAL - ' || SUBSTR(nome, 8),
    updated_at = datetime('now')
WHERE modelo_aeronave = 'SK76'
  AND tipo = 'INICIAL'
  AND deleted_at IS NULL
  AND nome LIKE 'SK76 - %'
  AND nome NOT LIKE '% - INICIAL - %';

UPDATE modelos_sessao
SET nome = 'AW139 - INICIAL - ' || SUBSTR(nome, 9),
    updated_at = datetime('now')
WHERE modelo_aeronave = 'AW139'
  AND tipo = 'INICIAL'
  AND deleted_at IS NULL
  AND nome LIKE 'AW139 - %'
  AND nome NOT LIKE '% - INICIAL - %';

-- Verificação
SELECT codigo, nome FROM modelos_sessao
WHERE modelo_aeronave IN ('SK76', 'AW139')
  AND tipo = 'INICIAL'
  AND deleted_at IS NULL
ORDER BY modelo_aeronave, codigo;
