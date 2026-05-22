-- Migration 0380: Inserir manobras offshore reais na sessão 10/12 do SK76
-- Entram: S76-TDP-00 (Decolagem Helideck), S76-LDP-00 (Pouso Helideck), S76-DIT-71 (Ditching)
-- Saem: 76-DECSI, 76-OILMT, 76-FLWNR (menos específicas de offshore)
-- Mantém 7A/7B/8AB

-- 1. Remover vínculos atuais (migration 0379)
DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-I-10/12' AND deleted_at IS NULL)
  AND deleted_at IS NULL;

-- 2. Inserir com manobras offshore
WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('SK76-I-10/12',  1, '76-PRGGP',  'PF:AB'),
  ('SK76-I-10/12',  2, 'S76-TDP-00','PF:A'),
  ('SK76-I-10/12',  3, '76-APXOI',  'PF:B'),
  ('SK76-I-10/12',  4, '76-APXAL',  'PF:AB'),
  ('SK76-I-10/12',  5, '76-APXPI',  'PF:A'),
  ('SK76-I-10/12',  6, '76-ARRIF',  'PF:B'),
  ('SK76-I-10/12',  7, '76-MOTAP',  'PF:A'),
  ('SK76-I-10/12',  8, '76-MOTCZ',  'PF:AB'),
  ('SK76-I-10/12',  9, '76-POUMO',  'PF:B'),
  ('SK76-I-10/12', 10, 'S76-LDP-00','PF:AB'),
  ('SK76-I-10/12', 11, '76-AUTAG',  'PF:A'),
  ('SK76-I-10/12', 12, '76-MOTHV',  'PF:B'),
  ('SK76-I-10/12', 13, '76-MOTCA',  'PF:A'),
  ('SK76-I-10/12', 14, '76-MOTCB',  'PF:B'),
  ('SK76-I-10/12', 15, '76-HIDPB',  'PF:AB'),
  ('SK76-I-10/12', 16, '76-INCMO',  'PF:A'),
  ('SK76-I-10/12', 17, '76-DUAHV',  'PF:B'),
  ('SK76-I-10/12', 18, '76-DUADC',  'PF:AB'),
  ('SK76-I-10/12', 19, '76-DUACZ',  'PF:A'),
  ('SK76-I-10/12', 20, '76-COMBX',  'PF:AB'),
  ('SK76-I-10/12', 21, 'S76-DIT-71','PF:B'),
  ('SK76-I-10/12', 22, '76-POUAB',  'PF:AB')
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

-- 3. Verificação
SELECT msm.ordem, m.codigo, m.nome, msm.tripulante
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
