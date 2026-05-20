-- Migration 0236: Normalizar SK76 em funcionários/modelos e corrigir multi-aeronave
-- Data: 2026-03-06

-- 1) Consolidar o modelo legado S76 como SK76 em todos os campos de exibição
UPDATE modelos_aeronave
SET codigo = 'SK76',
    nome = 'SK76',
    modelo = 'SK76',
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND (
    UPPER(TRIM(COALESCE(codigo, ''))) IN ('S76', 'SK76')
    OR UPPER(TRIM(COALESCE(nome, ''))) IN ('S76', 'SK76')
    OR UPPER(TRIM(COALESCE(modelo, ''))) IN ('S76', 'SK76')
  );

-- 2) Normalizar a coluna legada de aeronave
UPDATE funcionarios
SET aeronave = REPLACE(REPLACE(UPPER(TRIM(aeronave)), 'S76', 'SK76'), 'SKK76', 'SK76'),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND NULLIF(TRIM(COALESCE(aeronave, '')), '') IS NOT NULL
  AND UPPER(TRIM(aeronave)) LIKE '%S76%';

-- 3) Garantir Wilson Nery como piloto AW139 e SK76
UPDATE funcionarios
SET modelo_aeronave_id = '5,6',
    aeronave = 'AW139 / SK76',
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND UPPER(nome) = 'WILSON MACIEL MARTINS NERY';

-- 4) Corrigir funcionários sem aeronave para SK76
UPDATE funcionarios
SET modelo_aeronave_id = '6',
    aeronave = 'SK76',
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND (modelo_aeronave_id IS NULL OR TRIM(COALESCE(modelo_aeronave_id, '')) = '')
  AND (aeronave IS NULL OR TRIM(COALESCE(aeronave, '')) = '');
