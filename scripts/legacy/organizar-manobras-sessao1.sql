-- SESSÃO 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO (modelo_id = 4)
-- Organizar manobras na ordem correta conforme documento

-- Limpar manobras existentes da sessão 1
DELETE FROM modelo_sessao_manobras WHERE modelo_id = 4;

-- Inserir manobras na ordem correta
-- #1 - FLY-BAS-X1 - Controle geral VFR
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 1, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'FLY-BAS-X1';

-- #2 - FLY-BAS-X3 - Hover & taxi
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 2, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'FLY-BAS-X3';

-- #3 - OPS-NRM-X1 - Procedimentos normais
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 3, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'OPS-NRM-X1';

-- #4 - OPS-NRM-X2 - Decolagens & pousos
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 4, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'OPS-NRM-X2';

-- #5 - OPS-NRM-X3 - Circuito de tráfego
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 5, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'OPS-NRM-X3';

-- #6 - WAR-LOW-29 - Rotor RPM low
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 6, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'WAR-LOW-29';

-- #7 - WAR-HIG-29 - Rotor RPM high
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 7, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'WAR-HIG-29';

-- #8 - CAU-HOT-65 - Hot start
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 8, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-HOT-65';

-- #9 - CAU-CST-59 - Compressor stall
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 9, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-CST-59';

-- #10 - CAU-OVS-64 - Engine overspeed
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 10, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-OVS-64';

-- #11 - CAU-NGO-63 - NG overspeed
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 11, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-NGO-63';

-- #12 - CAU-CND-61 - Compressor no demand
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 12, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-CND-61';

-- #13 - CAU-TNF-62 - Throttle non-follow
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 13, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-TNF-62';

-- #14 - CAU-FLO-73 - Fuel low
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 14, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-FLO-73';

-- #15 - CAU-2FP-74 - Double fuel pump failure
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 15, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-2FP-74';

-- #16 - CAU-EFP-75 - Engine fuel pump failure
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 16, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'CAU-EFP-75';

-- #17 - WAR-OIL-18 - Oil pressure low
INSERT INTO modelo_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at, updated_at)
SELECT 4, id, 17, 1, datetime('now'), datetime('now')
FROM manobras WHERE codigo = 'WAR-OIL-18';

-- Verificar resultado
SELECT 
    msm.ordem,
    m.codigo,
    m.nome,
    CASE WHEN msm.obrigatoria = 1 THEN 'Sim' ELSE 'Não' END as obrigatoria
FROM modelo_sessao_manobras msm
INNER JOIN manobras m ON msm.manobra_id = m.id
WHERE msm.modelo_id = 4
  AND msm.deleted_at IS NULL
ORDER BY msm.ordem;
