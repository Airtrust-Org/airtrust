-- Migration 0376: Copiar PF de observacoes para tripulante nos modelos SK76 Inicial
-- Causa: a migration 0375 gravou PF:A/PF:B/PF:AB em observacoes,
-- mas o frontend lê o campo tripulante (que estava 'AB' em todas as 264 linhas).
-- Solução: extrair 'A', 'B', 'AB' de observacoes e gravar em tripulante.

UPDATE modelos_sessao_manobras
SET tripulante = REPLACE(observacoes, 'PF:', ''),
    updated_at = datetime('now')
WHERE modelo_id IN (
  SELECT id FROM modelos_sessao
  WHERE codigo IN (
    'SK76-I-01/12','SK76-I-02/12','SK76-I-03/12','SK76-I-04/12',
    'SK76-I-05/12','SK76-I-06/12','SK76-I-07/12','SK76-I-08/12',
    'SK76-I-09/12','SK76-I-10/12','SK76-I-11/12','SK76-I-12/12'
  )
)
AND observacoes LIKE 'PF:%'
AND deleted_at IS NULL;

-- Verificação
SELECT
  tripulante,
  COUNT(*) AS cnt
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
WHERE ms.codigo LIKE 'SK76-I-__/12'
  AND msm.deleted_at IS NULL
GROUP BY tripulante
ORDER BY tripulante;
