-- Rename manobra codes to A139-LOFT-01..22 based on ordem in the AW139 periodic model
-- This updates the manobras table for the 22 LOFT items associated with the model

UPDATE manobras
SET codigo = (
  SELECT printf('A139-LOFT-%02d', msm.ordem)
  FROM modelos_sessao_manobras msm
  JOIN modelos_sessao ms ON ms.id = msm.modelo_id
  WHERE msm.manobra_id = manobras.id
    AND ms.nome = 'AW139 - PERIÓDICO - 03/03: LOFT E CHECK FINAL'
  LIMIT 1
)
WHERE id IN (
  SELECT msm.manobra_id
  FROM modelos_sessao_manobras msm
  JOIN modelos_sessao ms ON ms.id = msm.modelo_id
  WHERE ms.nome = 'AW139 - PERIÓDICO - 03/03: LOFT E CHECK FINAL'
);

-- Verify: select updated codes for both models (run separately as queries)
