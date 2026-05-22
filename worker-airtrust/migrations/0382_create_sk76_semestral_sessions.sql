-- Migration 0382: Criar sessões semestrais do SK76
-- Usando as sessões semestrais do AW139 como referência (A139-S-01/02 e A139-S-02/02)
-- LOFT-NOT-* e LOFT-CHK-* são manobras genéricas (sem prefixo de aeronave), reutilizadas aqui

-- 1. Criar SK76 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA
INSERT INTO modelos_sessao (codigo, nome, descricao, duracao_estimada, ativo, tipo_sessao_id, modelo_aeronave, empresa_id, created_at, updated_at)
VALUES ('SK76-S-01/02', 'SK76 - SEMESTRAL - 01/02: LOFT e OPERAÇÃO NOTURNA', 'LOFT noturno, cenários de operação noturna, gerenciamento de recursos da tripulação em condições de baixa luminosidade', 120, 1, 16, 'SK76', 1, datetime('now'), datetime('now'));

-- 2. Criar SK76 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR
INSERT INTO modelos_sessao (codigo, nome, descricao, duracao_estimada, ativo, tipo_sessao_id, modelo_aeronave, empresa_id, created_at, updated_at)
VALUES ('SK76-S-02/02', 'SK76 - SEMESTRAL - 02/02: LOFT e CHECK DE IFR', 'LOFT IFR, verificação de proficiência em IFR, tomada de decisão e gerenciamento de ameaças', 120, 1, 16, 'SK76', 1, datetime('now'), datetime('now'));

-- 3. Vincular manobras LOFT-NOT-* à sessão 01/02 (LOFT e OPERAÇÃO NOTURNA)
WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('SK76-S-01/02',  1, 'LOFT-NOT-01', 'PF:AB'),
  ('SK76-S-01/02',  2, 'LOFT-NOT-02', 'PF:AB'),
  ('SK76-S-01/02',  3, 'LOFT-NOT-03', 'PF:AB'),
  ('SK76-S-01/02',  4, 'LOFT-NOT-04', 'PF:AB'),
  ('SK76-S-01/02',  5, 'LOFT-NOT-05', 'PF:AB'),
  ('SK76-S-01/02',  6, 'LOFT-NOT-06', 'PF:AB'),
  ('SK76-S-01/02',  7, 'LOFT-NOT-07', 'PF:AB'),
  ('SK76-S-01/02',  8, 'LOFT-NOT-08', 'PF:AB'),
  ('SK76-S-01/02',  9, 'LOFT-NOT-09', 'PF:AB'),
  ('SK76-S-01/02', 10, 'LOFT-NOT-10', 'PF:AB'),
  ('SK76-S-01/02', 11, 'LOFT-NOT-11', 'PF:AB'),
  ('SK76-S-01/02', 12, 'LOFT-NOT-12', 'PF:AB'),
  ('SK76-S-01/02', 13, 'LOFT-NOT-13', 'PF:AB'),
  ('SK76-S-01/02', 14, 'LOFT-NOT-14', 'PF:AB'),
  ('SK76-S-01/02', 15, 'LOFT-NOT-15', 'PF:AB'),
  ('SK76-S-01/02', 16, 'LOFT-NOT-16', 'PF:AB'),
  ('SK76-S-01/02', 17, 'LOFT-NOT-17', 'PF:AB'),
  ('SK76-S-01/02', 18, 'LOFT-NOT-18', 'PF:AB'),
  ('SK76-S-01/02', 19, 'LOFT-NOT-19', 'PF:AB'),
  ('SK76-S-01/02', 20, 'LOFT-NOT-20', 'PF:AB'),
  ('SK76-S-01/02', 21, 'LOFT-NOT-21', 'PF:AB'),
  ('SK76-S-01/02', 22, 'LOFT-NOT-22', 'PF:AB')
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

-- 4. Vincular manobras LOFT-CHK-* à sessão 02/02 (LOFT e CHECK DE IFR)
WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('SK76-S-02/02',  1, 'LOFT-CHK-01', 'PF:AB'),
  ('SK76-S-02/02',  2, 'LOFT-CHK-02', 'PF:AB'),
  ('SK76-S-02/02',  3, 'LOFT-CHK-03', 'PF:AB'),
  ('SK76-S-02/02',  4, 'LOFT-CHK-04', 'PF:AB'),
  ('SK76-S-02/02',  5, 'LOFT-CHK-05', 'PF:AB'),
  ('SK76-S-02/02',  6, 'LOFT-CHK-06', 'PF:AB'),
  ('SK76-S-02/02',  7, 'LOFT-CHK-07', 'PF:AB'),
  ('SK76-S-02/02',  8, 'LOFT-CHK-08', 'PF:AB'),
  ('SK76-S-02/02',  9, 'LOFT-CHK-09', 'PF:AB'),
  ('SK76-S-02/02', 10, 'LOFT-CHK-10', 'PF:AB'),
  ('SK76-S-02/02', 11, 'LOFT-CHK-11', 'PF:AB'),
  ('SK76-S-02/02', 12, 'LOFT-CHK-12', 'PF:AB'),
  ('SK76-S-02/02', 13, 'LOFT-CHK-13', 'PF:AB'),
  ('SK76-S-02/02', 14, 'LOFT-CHK-14', 'PF:AB'),
  ('SK76-S-02/02', 15, 'LOFT-CHK-15', 'PF:AB'),
  ('SK76-S-02/02', 16, 'LOFT-CHK-16', 'PF:AB'),
  ('SK76-S-02/02', 17, 'LOFT-CHK-17', 'PF:AB'),
  ('SK76-S-02/02', 18, 'LOFT-CHK-18', 'PF:AB'),
  ('SK76-S-02/02', 19, 'LOFT-CHK-19', 'PF:AB'),
  ('SK76-S-02/02', 20, 'LOFT-CHK-20', 'PF:AB'),
  ('SK76-S-02/02', 21, 'LOFT-CHK-21', 'PF:AB'),
  ('SK76-S-02/02', 22, 'LOFT-CHK-22', 'PF:AB')
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

-- 5. Verificação
SELECT '--- SK76-S-01/02 ---' AS secao;
SELECT msm.ordem, m.codigo, m.nome, msm.tripulante
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
JOIN manobras m ON m.id = msm.manobra_id
WHERE ms.codigo = 'SK76-S-01/02'
  AND msm.deleted_at IS NULL
ORDER BY msm.ordem;

SELECT '--- SK76-S-02/02 ---' AS secao;
SELECT msm.ordem, m.codigo, m.nome, msm.tripulante
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
JOIN manobras m ON m.id = msm.manobra_id
WHERE ms.codigo = 'SK76-S-02/02'
  AND msm.deleted_at IS NULL
ORDER BY msm.ordem;
