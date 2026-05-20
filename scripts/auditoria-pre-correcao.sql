-- ========================================
-- AUDITORIA PRÉ-CORREÇÃO: VALIDAÇÃO DE DADOS
-- Data: 28/11/2025
-- ========================================

-- 1. VERIFICAR FUNCIONÁRIOS EXISTENTES vs. CSV
SELECT '=== 1. FUNCIONÁRIOS NO CSV vs. BANCO ===' AS secao;

WITH csv_funcionarios AS (
  SELECT DISTINCT funcionario_cpf
  FROM (
    -- Lista de CPFs do CSV fornecido
    VALUES 
      ('134.651.428-37'), ('419.906.257-20'), ('052.414.847-36'),
      ('387.181.008-80'), ('899.850.527-49'), ('017.058.448-80'),
      ('772.105.497-49'), ('722.443.567-87'), ('112.015.317-48'),
      ('401.238.047-87'), ('734.990.727-34'), ('311.120.807-91'),
      ('058.412.708-18'), ('563.716.080-53'), ('093.127.887-28'),
      ('663.794.586-20'), ('939.571.227-91'), ('155.257.297-84'),
      ('713.920.927-87'), ('145.880.747-92'), ('052.017.507-70'),
      ('768.506.843-53'), ('083.286.227-42'), ('108.943.047-71'),
      ('012.598.600-94'), ('102.896.837-66')
  ) AS t(funcionario_cpf)
)
SELECT 
  cf.funcionario_cpf,
  f.nome,
  f.codigo_anac,
  CASE 
    WHEN f.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN f.deleted_at IS NOT NULL THEN '⚠️ DELETADO'
    ELSE '✅ OK'
  END AS status_banco
FROM csv_funcionarios cf
LEFT JOIN funcionarios f ON f.cpf = cf.funcionario_cpf
ORDER BY status_banco DESC, cf.funcionario_cpf;

-- 2. VERIFICAR QUALIFICAÇÕES EXISTENTES vs. CSV
SELECT '=== 2. QUALIFICAÇÕES NO CSV vs. BANCO ===' AS secao;

WITH csv_qualificacoes AS (
  SELECT DISTINCT qualificacao_codigo
  FROM (
    VALUES 
      ('B'), ('C'), ('CMA'), ('D1'), ('D2'), ('D3'), ('D4'),
      ('E1'), ('E2'), ('E3'), ('E4'), ('E5'), ('F1'), ('F2'),
      ('FAP05.2'), ('FAP06'), ('FAP06SEM'), ('FAP14'), ('G1'), ('G2'),
      ('H'), ('CHTIFR'), ('IFR'), ('LOFT'), ('NOT'), ('OFEXCRED'),
      ('OPC'), ('ASO.P'), ('SAEFAP06'), ('SAEFAP14'), ('TIPO'), ('E6')
  ) AS t(qualificacao_codigo)
)
SELECT 
  cq.qualificacao_codigo,
  qt.descricao,
  qt.tipo_licenca,
  CASE 
    WHEN qt.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qt.deleted_at IS NOT NULL THEN '⚠️ DELETADO'
    ELSE '✅ OK'
  END AS status_banco
FROM csv_qualificacoes cq
LEFT JOIN qualificacoes_tipos qt ON qt.codigo = cq.qualificacao_codigo
ORDER BY status_banco DESC, cq.qualificacao_codigo;

-- 3. VERIFICAR REGISTROS DUPLICADOS NO HISTÓRICO
SELECT '=== 3. DUPLICATAS NO HISTÓRICO (MESMO CPF + CÓDIGO + VENCIMENTO) ===' AS secao;

SELECT 
  h.funcionario_cpf,
  f.nome AS funcionario_nome,
  h.qualificacao_codigo,
  h.data_vencimento,
  COUNT(*) AS total_duplicatas,
  GROUP_CONCAT(h.id) AS ids_duplicados,
  GROUP_CONCAT(h.status) AS status_registros,
  GROUP_CONCAT(h.data_conclusao) AS datas_conclusao
FROM qualificacoes_historico h
LEFT JOIN funcionarios f ON f.cpf = h.funcionario_cpf
WHERE h.deleted_at IS NULL
  AND h.funcionario_cpf IN (
    '134.651.428-37', '419.906.257-20', '052.414.847-36',
    '387.181.008-80', '899.850.527-49', '017.058.448-80',
    '772.105.497-49', '722.443.567-87', '112.015.317-48',
    '401.238.047-87', '734.990.727-34', '311.120.807-91',
    '058.412.708-18', '563.716.080-53', '093.127.887-28',
    '663.794.586-20', '939.571.227-91', '155.257.297-84',
    '713.920.927-87', '145.880.747-92', '052.017.507-70',
    '768.506.843-53', '083.286.227-42', '108.943.047-71',
    '012.598.600-94', '102.896.837-66'
  )
GROUP BY h.funcionario_cpf, h.qualificacao_codigo, h.data_vencimento
HAVING COUNT(*) > 1
ORDER BY total_duplicatas DESC, h.funcionario_cpf;

-- 4. VERIFICAR REGISTROS COM DATA VENCIMENTO NO PASSADO
SELECT '=== 4. REGISTROS VENCIDOS (ANTES DE HOJE) ===' AS secao;

SELECT 
  h.funcionario_cpf,
  f.nome AS funcionario_nome,
  h.qualificacao_codigo,
  h.data_vencimento,
  h.status,
  julianday('now') - julianday(h.data_vencimento) AS dias_vencido
FROM qualificacoes_historico h
LEFT JOIN funcionarios f ON f.cpf = h.funcionario_cpf
WHERE h.deleted_at IS NULL
  AND h.data_vencimento < date('now')
  AND h.funcionario_cpf IN (
    '134.651.428-37', '419.906.257-20', '052.414.847-36',
    '387.181.008-80', '899.850.527-49', '017.058.448-80',
    '772.105.497-49', '722.443.567-87', '112.015.317-48',
    '401.238.047-87', '734.990.727-34', '311.120.807-91',
    '058.412.708-18', '563.716.080-53', '093.127.887-28',
    '663.794.586-20', '939.571.227-91', '155.257.297-84',
    '713.920.927-87', '145.880.747-92', '052.017.507-70',
    '768.506.843-53', '083.286.227-42', '108.943.047-71',
    '012.598.600-94', '102.896.837-66'
  )
ORDER BY dias_vencido DESC
LIMIT 20;

-- 5. VERIFICAR REGISTROS SEM RENOVACAO_DE MAS COM MÚLTIPLAS ENTRADAS
SELECT '=== 5. CANDIDATOS A RENOVAÇÃO (MÚLTIPLAS ENTRADAS, SEM VÍNCULO) ===' AS secao;

SELECT 
  h.funcionario_cpf,
  f.nome AS funcionario_nome,
  h.qualificacao_codigo,
  COUNT(*) AS total_registros,
  GROUP_CONCAT(h.data_conclusao ORDER BY h.data_conclusao) AS datas_conclusao,
  GROUP_CONCAT(h.data_vencimento ORDER BY h.data_conclusao) AS datas_vencimento,
  GROUP_CONCAT(h.status ORDER BY h.data_conclusao) AS status_list,
  SUM(CASE WHEN h.renovacao_de IS NOT NULL THEN 1 ELSE 0 END) AS registros_com_vinculo
FROM qualificacoes_historico h
LEFT JOIN funcionarios f ON f.cpf = h.funcionario_cpf
WHERE h.deleted_at IS NULL
  AND h.funcionario_cpf IN (
    '134.651.428-37', '419.906.257-20', '052.414.847-36',
    '387.181.008-80', '899.850.527-49', '017.058.448-80',
    '772.105.497-49', '722.443.567-87', '112.015.317-48',
    '401.238.047-87', '734.990.727-34', '311.120.807-91',
    '058.412.708-18', '563.716.080-53', '093.127.887-28',
    '663.794.586-20', '939.571.227-91', '155.257.297-84',
    '713.920.927-87', '145.880.747-92', '052.017.507-70',
    '768.506.843-53', '083.286.227-42', '108.943.047-71',
    '012.598.600-94', '102.896.837-66'
  )
GROUP BY h.funcionario_cpf, h.qualificacao_codigo
HAVING total_registros > 1
ORDER BY total_registros DESC, h.funcionario_cpf
LIMIT 30;

-- 6. VERIFICAR DISCREPÂNCIAS ENTRE CSV E BANCO
SELECT '=== 6. REGISTROS NO CSV QUE NÃO EXISTEM NO BANCO ===' AS secao;

WITH csv_data AS (
  SELECT * FROM (VALUES
    -- Apenas uma amostra para teste (primeiros 10 registros do CSV)
    ('134.651.428-37', 'B', '2026-10-22'),
    ('419.906.257-20', 'B', '2026-10-28'),
    ('052.414.847-36', 'B', '2026-11-19'),
    ('387.181.008-80', 'B', '2026-11-03'),
    ('899.850.527-49', 'B', '2026-01-13'),
    ('017.058.448-80', 'B', '2026-11-19'),
    ('772.105.497-49', 'B', '2026-10-30'),
    ('722.443.567-87', 'B', '2026-10-11'),
    ('112.015.317-48', 'B', '2026-11-04'),
    ('401.238.047-87', 'B', '2026-04-09')
  ) AS t(cpf, codigo, vencimento)
)
SELECT 
  cd.cpf,
  cd.codigo,
  cd.vencimento AS vencimento_csv,
  h.data_vencimento AS vencimento_banco,
  CASE 
    WHEN h.id IS NULL THEN '❌ NÃO EXISTE NO BANCO'
    WHEN h.data_vencimento != cd.vencimento THEN '⚠️ VENCIMENTO DIFERENTE'
    ELSE '✅ OK'
  END AS status
FROM csv_data cd
LEFT JOIN qualificacoes_historico h 
  ON h.funcionario_cpf = cd.cpf 
  AND h.qualificacao_codigo = cd.codigo
  AND h.data_vencimento = cd.vencimento
  AND h.deleted_at IS NULL
ORDER BY status DESC;

-- 7. RESUMO GERAL
SELECT '=== 7. RESUMO GERAL ===' AS secao;

SELECT 
  'Total funcionários no banco' AS metrica,
  COUNT(*) AS valor
FROM funcionarios 
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Total qualificações no banco',
  COUNT(*)
FROM qualificacoes_tipos
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Total registros histórico',
  COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL
UNION ALL
SELECT 
  'Registros com renovacao_de preenchido',
  COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL 
  AND renovacao_de IS NOT NULL
UNION ALL
SELECT 
  'Registros com status = renovada',
  COUNT(*)
FROM qualificacoes_historico
WHERE deleted_at IS NULL 
  AND status = 'renovada';
