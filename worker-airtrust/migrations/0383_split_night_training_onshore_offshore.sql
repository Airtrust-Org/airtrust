-- Migration 0383: Separar treinamentos noturnos em ONSHORE e OFFSHORE
-- AW139 e SK76 tinham sessões combinadas. Agora cada um tem duas sessões:
-- - ONSHORE: circuito noturno, briefing, cockpit, CRM, autorotação, black hole
-- - OFFSHORE: helideck, plataforma, ditching, OEI em operações offshore

-- ==========================================================================
-- 1. AW139 — Renomear sessão existente para ONSHORE
-- ==========================================================================
UPDATE modelos_sessao
SET nome = 'AW139 - TREINAMENTO NOTURNO — ONSHORE',
    descricao = 'Treinamento noturno onshore para AW139. Cobre planejamento noturno, configuração de cockpit, circuito de tráfego padrão, aproximações, arremetidas, autorotação noturna, Black Hole Effect e CRM.',
    updated_at = datetime('now')
WHERE codigo = 'A139-NOT-01' AND deleted_at IS NULL;

-- Remove manobras offshore da sessão onshore (5 manobras)
DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'A139-NOT-01' AND deleted_at IS NULL)
  AND manobra_id IN (SELECT id FROM manobras WHERE codigo IN ('LOFT-NOT-22', 'LOFT-NOT-23', 'LOFT-NOT-27', 'LOFT-NOT-28', 'OPS-OFF-X2'))
  AND deleted_at IS NULL;

-- Adicionar manobras onshore complementares (5 novas: LOFT-NOT-01, 02, 07, 10, 20)
WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('A139-NOT-01',  1, 'LOFT-NOT-01', 'PF:AB'),
  ('A139-NOT-01',  2, 'LOFT-NOT-02', 'PF:AB'),
  ('A139-NOT-01',  3, 'LOFT-NOT-04', 'PF:AB'),
  ('A139-NOT-01',  4, 'LOFT-NOT-05', 'PF:AB'),
  ('A139-NOT-01',  5, 'LOFT-NOT-06', 'PF:AB'),
  ('A139-NOT-01',  6, 'LOFT-NOT-07', 'PF:AB'),
  ('A139-NOT-01',  7, 'LOFT-NOT-08', 'PF:AB'),
  ('A139-NOT-01',  8, 'FLY-BAS-X3',  'PF:AB'),
  ('A139-NOT-01',  9, 'LOFT-NOT-10', 'PF:AB'),
  ('A139-NOT-01', 10, 'LOFT-NOT-24', 'PF:AB'),
  ('A139-NOT-01', 11, 'LOFT-NOT-25', 'PF:AB'),
  ('A139-NOT-01', 12, 'LOFT-NOT-26', 'PF:AB'),
  ('A139-NOT-01', 13, 'LOFT-NOT-15', 'PF:AB'),
  ('A139-NOT-01', 14, 'OPS-APP-X4',  'PF:AB'),
  ('A139-NOT-01', 15, 'LOFT-NOT-29', 'PF:AB'),
  ('A139-NOT-01', 16, 'LOFT-NOT-30', 'PF:AB'),
  ('A139-NOT-01', 17, 'LOFT-NOT-16', 'PF:AB'),
  ('A139-NOT-01', 18, 'LOFT-NOT-31', 'PF:AB'),
  ('A139-NOT-01', 19, 'LOFT-NOT-09', 'PF:AB'),
  ('A139-NOT-01', 20, 'LOFT-NOT-11', 'PF:AB'),
  ('A139-NOT-01', 21, 'LOFT-NOT-21', 'PF:AB'),
  ('A139-NOT-01', 22, 'LOFT-NOT-20', 'PF:AB')
)
INSERT OR REPLACE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at)
SELECT ms.id, m.id, data.ordem, 1, data.pf, REPLACE(data.pf, 'PF:', ''), datetime('now'), datetime('now')
FROM data
JOIN modelos_sessao ms ON ms.codigo = data.codigo AND ms.deleted_at IS NULL
JOIN manobras m ON m.codigo = data.manobra AND m.deleted_at IS NULL;

-- ==========================================================================
-- 2. AW139 — Criar sessão OFFSHORE
-- ==========================================================================
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, duracao_estimada, ativo, tipo_sessao_id, modelo_aeronave, empresa_id, gera_qualificacao, qualificacao_tipo_id, created_at, updated_at)
VALUES ('A139-NOT-02', 'AW139 - TREINAMENTO NOTURNO — OFFSHORE', 'AERONAVE', 'Treinamento noturno offshore para AW139. Cobre decolagem e pouso em helideck, aproximação offshore, OEI em operações offshore, ditching e CRM em ambiente marítimo.', 120, 1, 9, 'AW139', 1, 1, NULL, datetime('now'), datetime('now'));

WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('A139-NOT-02',  1, 'LOFT-NOT-23', 'PF:AB'),
  ('A139-NOT-02',  2, 'LOFT-OFF-01', 'PF:AB'),
  ('A139-NOT-02',  3, 'LOFT-OFF-02', 'PF:AB'),
  ('A139-NOT-02',  4, 'LOFT-OFF-04', 'PF:AB'),
  ('A139-NOT-02',  5, 'LOFT-NOT-24', 'PF:AB'),
  ('A139-NOT-02',  6, 'LOFT-NOT-25', 'PF:AB'),
  ('A139-NOT-02',  7, 'LOFT-OFF-07', 'PF:AB'),
  ('A139-NOT-02',  8, 'OPS-OFF-X1',  'PF:AB'),
  ('A139-NOT-02',  9, 'LOFT-OFF-09', 'PF:AB'),
  ('A139-NOT-02', 10, 'LOFT-OFF-10', 'PF:AB'),
  ('A139-NOT-02', 11, 'LOFT-OFF-14', 'PF:AB'),
  ('A139-NOT-02', 12, 'OPS-OFF-X2',  'PF:AB'),
  ('A139-NOT-02', 13, 'LOFT-NOT-27', 'PF:AB'),
  ('A139-NOT-02', 14, 'LOFT-OFF-15', 'PF:AB'),
  ('A139-NOT-02', 15, 'LOFT-NOT-28', 'PF:AB'),
  ('A139-NOT-02', 16, 'LOFT-OFF-16', 'PF:AB'),
  ('A139-NOT-02', 17, 'LOFT-OFF-17', 'PF:AB'),
  ('A139-NOT-02', 18, 'LOFT-OFF-18', 'PF:AB'),
  ('A139-NOT-02', 19, 'LOFT-OFF-19', 'PF:AB'),
  ('A139-NOT-02', 20, 'LOFT-OFF-20', 'PF:AB'),
  ('A139-NOT-02', 21, 'LOFT-OFF-22', 'PF:AB'),
  ('A139-NOT-02', 22, 'LOFT-NOT-22', 'PF:AB')
)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at)
SELECT ms.id, m.id, data.ordem, 1, data.pf, REPLACE(data.pf, 'PF:', ''), datetime('now'), datetime('now')
FROM data
JOIN modelos_sessao ms ON ms.codigo = data.codigo AND ms.deleted_at IS NULL
JOIN manobras m ON m.codigo = data.manobra AND m.deleted_at IS NULL;

-- ==========================================================================
-- 3. SK76 — Renomear sessão existente para ONSHORE
-- ==========================================================================
UPDATE modelos_sessao
SET nome = 'SK76 - TREINAMENTO NOTURNO — ONSHORE',
    descricao = 'Treinamento noturno onshore para SK76. Cobre briefing noturno, inspeção e acionamento, configuração de cockpit, hover, circuito padrão, aproximações, autorotação noturna, Black Hole Effect e CRM.',
    updated_at = datetime('now')
WHERE codigo = 'S76-NOT-01' AND deleted_at IS NULL;

-- Remove manobras offshore da sessão onshore (7 manobras)
DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'S76-NOT-01' AND deleted_at IS NULL)
  AND manobra_id IN (SELECT id FROM manobras WHERE codigo IN ('S76-TDP-00', 'S76-LDP-00', 'S76-LOFT-26', 'S76-LOFT-27', 'S76-LOFT-29', 'S76-LOFT-30', 'S76-LOFT-34'))
  AND deleted_at IS NULL;

-- Adicionar manobras onshore complementares (7 novas do S76-LOFT geral)
WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('S76-NOT-01',  1, 'S76-LOFT-23', 'PF:AB'),
  ('S76-NOT-01',  2, 'S76-NVF-00',  'PF:AB'),
  ('S76-NOT-01',  3, 'S76-LOFT-24', 'PF:AB'),
  ('S76-NOT-01',  4, 'S76-HOV-00',  'PF:AB'),
  ('S76-NOT-01',  5, 'S76-LOFT-25', 'PF:AB'),
  ('S76-NOT-01',  6, 'S76-LOFT-04', 'PF:AB'),
  ('S76-NOT-01',  7, 'S76-LOFT-01', 'PF:AB'),
  ('S76-NOT-01',  8, 'S76-NDL-00',  'PF:AB'),
  ('S76-NOT-01',  9, 'S76-LOFT-28', 'PF:AB'),
  ('S76-NOT-01', 10, 'S76-LOFT-05', 'PF:AB'),
  ('S76-NOT-01', 11, 'S76-LOFT-18', 'PF:AB'),
  ('S76-NOT-01', 12, 'S76-LOFT-02', 'PF:AB'),
  ('S76-NOT-01', 13, 'S76-LOFT-19', 'PF:AB'),
  ('S76-NOT-01', 14, 'S76-LOFT-31', 'PF:AB'),
  ('S76-NOT-01', 15, 'S76-AUT-70',  'PF:AB'),
  ('S76-NOT-01', 16, 'S76-LOFT-32', 'PF:AB'),
  ('S76-NOT-01', 17, 'S76-LOFT-33', 'PF:AB'),
  ('S76-NOT-01', 18, 'S76-LOFT-06', 'PF:AB'),
  ('S76-NOT-01', 19, 'S76-LOFT-12', 'PF:AB'),
  ('S76-NOT-01', 20, 'S76-LOFT-16', 'PF:AB'),
  ('S76-NOT-01', 21, 'S76-LOFT-21', 'PF:AB'),
  ('S76-NOT-01', 22, 'S76-LOFT-22', 'PF:AB')
)
INSERT OR REPLACE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at)
SELECT ms.id, m.id, data.ordem, 1, data.pf, REPLACE(data.pf, 'PF:', ''), datetime('now'), datetime('now')
FROM data
JOIN modelos_sessao ms ON ms.codigo = data.codigo AND ms.deleted_at IS NULL
JOIN manobras m ON m.codigo = data.manobra AND m.deleted_at IS NULL;

-- ==========================================================================
-- 4. SK76 — Criar sessão OFFSHORE
-- ==========================================================================
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, duracao_estimada, ativo, tipo_sessao_id, modelo_aeronave, empresa_id, gera_qualificacao, qualificacao_tipo_id, created_at, updated_at)
VALUES ('S76-NOT-02', 'SK76 - TREINAMENTO NOTURNO — OFFSHORE', 'AERONAVE', 'Treinamento noturno offshore para SK76. Cobre decolagem e pouso em helideck, OEI em plataforma, ditching, aproximação offshore, falha de iluminação e CRM em ambiente marítimo.', 120, 1, 9, 'SK76', 1, 1, NULL, datetime('now'), datetime('now'));

WITH data(codigo, ordem, manobra, pf) AS (
  VALUES
  ('S76-NOT-02',  1, 'S76-TDP-00',     'PF:AB'),
  ('S76-NOT-02',  2, 'S76-LOFT-26',    'PF:AB'),
  ('S76-NOT-02',  3, 'LOFT-OFF-01',    'PF:AB'),
  ('S76-NOT-02',  4, 'LOFT-OFF-04',    'PF:AB'),
  ('S76-NOT-02',  5, 'S76-LOFT-28',    'PF:AB'),
  ('S76-NOT-02',  6, 'S76-LOFT-27',    'PF:AB'),
  ('S76-NOT-02',  7, 'LOFT-OFF-07',    'PF:AB'),
  ('S76-NOT-02',  8, 'LOFT-OFF-14',    'PF:AB'),
  ('S76-NOT-02',  9, 'S76-LDP-00',     'PF:AB'),
  ('S76-NOT-02', 10, 'S76-LOFT-29',    'PF:AB'),
  ('S76-NOT-02', 11, 'LOFT-OFF-15',    'PF:AB'),
  ('S76-NOT-02', 12, 'S76-LOFT-30',    'PF:AB'),
  ('S76-NOT-02', 13, 'LOFT-OFF-16',    'PF:AB'),
  ('S76-NOT-02', 14, 'LOFT-OFF-17',    'PF:AB'),
  ('S76-NOT-02', 15, 'LOFT-OFF-18',    'PF:AB'),
  ('S76-NOT-02', 16, 'LOFT-OFF-19',    'PF:AB'),
  ('S76-NOT-02', 17, 'LOFT-OFF-20',    'PF:AB'),
  ('S76-NOT-02', 18, 'LOFT-OFF-21',    'PF:AB'),
  ('S76-NOT-02', 19, 'LOFT-OFF-22',    'PF:AB'),
  ('S76-NOT-02', 20, 'S76-LOFT-34',    'PF:AB'),
  ('S76-NOT-02', 21, 'S76-DIT-71',     'PF:AB'),
  ('S76-NOT-02', 22, 'S76-LOFT-21',    'PF:AB')
)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, observacoes, tripulante, created_at, updated_at)
SELECT ms.id, m.id, data.ordem, 1, data.pf, REPLACE(data.pf, 'PF:', ''), datetime('now'), datetime('now')
FROM data
JOIN modelos_sessao ms ON ms.codigo = data.codigo AND ms.deleted_at IS NULL
JOIN manobras m ON m.codigo = data.manobra AND m.deleted_at IS NULL;

-- ==========================================================================
-- 5. Verificação
-- ==========================================================================
SELECT '--- A139-NOT-01 (ONSHORE) ---' AS secao;
SELECT msm.ordem, m.codigo, m.nome FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id JOIN manobras m ON m.id = msm.manobra_id WHERE ms.codigo = 'A139-NOT-01' AND msm.deleted_at IS NULL ORDER BY msm.ordem;

SELECT '--- A139-NOT-02 (OFFSHORE) ---' AS secao;
SELECT msm.ordem, m.codigo, m.nome FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id JOIN manobras m ON m.id = msm.manobra_id WHERE ms.codigo = 'A139-NOT-02' AND msm.deleted_at IS NULL ORDER BY msm.ordem;

SELECT '--- S76-NOT-01 (ONSHORE) ---' AS secao;
SELECT msm.ordem, m.codigo, m.nome FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id JOIN manobras m ON m.id = msm.manobra_id WHERE ms.codigo = 'S76-NOT-01' AND msm.deleted_at IS NULL ORDER BY msm.ordem;

SELECT '--- S76-NOT-02 (OFFSHORE) ---' AS secao;
SELECT msm.ordem, m.codigo, m.nome FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id JOIN manobras m ON m.id = msm.manobra_id WHERE ms.codigo = 'S76-NOT-02' AND msm.deleted_at IS NULL ORDER BY msm.ordem;
