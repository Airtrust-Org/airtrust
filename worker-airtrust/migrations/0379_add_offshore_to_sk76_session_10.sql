-- Migration 0379: Adicionar OFFSHORE à sessão 10/12 do SK76 e trocar manobras
-- Objetivo: tornar a sessão 10 mais focada em operações offshore,
-- trocando manobras de IFR puro/AFCS/aviônicos por emergências críticas offshore
-- (falhas duplas de motor, óleo, combustível) e manter 7A/7B/8AB.

-- 1. Atualizar nome e descrição da sessão
UPDATE modelos_sessao
SET nome = 'SK76 - INICIAL - 10/12 - OPERAÇÃO OFFSHORE, IFR/OEI COMPLEXA E APROXIMAÇÕES CRÍTICAS',
    descricao = 'Operações offshore, cenários IFR/OEI complexos, falhas duplas de motor, gestão de combustível e aproximações críticas',
    updated_at = datetime('now')
WHERE codigo = 'SK76-I-10/12' AND deleted_at IS NULL;

-- 2. Remover vínculos antigos
DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-10/12' AND deleted_at IS NULL)
  AND deleted_at IS NULL;

-- 3. Inserir nova distribuição com manobras offshore (7A/7B/8AB)
WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('SK76-I-10/12',  1, '76-PRGGP', 'PF:AB'),
  ('SK76-I-10/12',  2, '76-DECSI', 'PF:A'),
  ('SK76-I-10/12',  3, '76-APXOI', 'PF:B'),
  ('SK76-I-10/12',  4, '76-APXAL', 'PF:AB'),
  ('SK76-I-10/12',  5, '76-APXPI', 'PF:A'),
  ('SK76-I-10/12',  6, '76-ARRIF', 'PF:B'),
  ('SK76-I-10/12',  7, '76-MOTAP', 'PF:A'),
  ('SK76-I-10/12',  8, '76-MOTCZ', 'PF:AB'),
  ('SK76-I-10/12',  9, '76-POUMO', 'PF:B'),
  ('SK76-I-10/12', 10, '76-POUAB', 'PF:AB'),
  ('SK76-I-10/12', 11, '76-AUTAG', 'PF:A'),
  ('SK76-I-10/12', 12, '76-MOTHV', 'PF:B'),
  ('SK76-I-10/12', 13, '76-MOTCA', 'PF:A'),
  ('SK76-I-10/12', 14, '76-MOTCB', 'PF:B'),
  ('SK76-I-10/12', 15, '76-HIDPB', 'PF:AB'),
  ('SK76-I-10/12', 16, '76-INCMO', 'PF:A'),
  ('SK76-I-10/12', 17, '76-DUAHV', 'PF:B'),
  ('SK76-I-10/12', 18, '76-DUADC', 'PF:AB'),
  ('SK76-I-10/12', 19, '76-DUACZ', 'PF:A'),
  ('SK76-I-10/12', 20, '76-OILMT', 'PF:AB'),
  ('SK76-I-10/12', 21, '76-COMBX', 'PF:B'),
  ('SK76-I-10/12', 22, '76-FLWNR', 'PF:AB')
)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at)
SELECT
  ms.id,
  m.id,
  data.ordem,
  1,
  data.pf,
  REPLACE(data.pf, 'PF:', ''),
  datetime('now'),
  datetime('now')
FROM data
JOIN modelos_sessao ms ON ms.codigo = data.codigo AND ms.deleted_at IS NULL
JOIN manobras m ON m.codigo = data.manobra AND m.deleted_at IS NULL;

-- 4. Verificação
SELECT
  msm.ordem,
  m.codigo,
  m.nome,
  msm.tripulante
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
JOIN manobras m ON m.id = msm.manobra_id
WHERE ms.codigo = 'SK76-I-10/12'
  AND msm.deleted_at IS NULL
ORDER BY msm.ordem;

SELECT tripulante, COUNT(*) AS cnt
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
WHERE ms.codigo = 'SK76-I-10/12'
  AND msm.deleted_at IS NULL
GROUP BY tripulante
ORDER BY tripulante;
