
-- adriana.brasil@voecostadosol.com.br | 3.6.3 - Operações em Terrenos Desabitados ou Selva | EdApp: 25/09/2025 10:30
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'E6' as codigo_esperado,
  '2025-09-25' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-09-25' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E6'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- adriana.brasil@voecostadosol.com.br | 3.6.5 - Operação Aeromédica | EdApp: 22/10/2025 09:25
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'E4' as codigo_esperado,
  '2025-10-22' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-22' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E4'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- adriana.brasil@voecostadosol.com.br | 3.7 - Emergências Gerais | EdApp: 22/10/2025 11:13
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'C' as codigo_esperado,
  '2025-10-22' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-22' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'C'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- adriana.brasil@voecostadosol.com.br | 3.5 - Conhecimentos Gerais de Aeronaves | EdApp: 22/10/2025 20:04
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'B' as codigo_esperado,
  '2025-10-22' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-22' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'B'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- adriana.brasil@voecostadosol.com.br | 3.6.1 - Operações Offshore | EdApp: 24/10/2025 12:40
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'E1' as codigo_esperado,
  '2025-10-24' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-24' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E1'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- adriana.brasil@voecostadosol.com.br | 3.6.4 - Operação PBN - Navegação Baseada em Performance | EdApp: 17/11/2025 10:21
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'E2' as codigo_esperado,
  '2025-11-17' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-17' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E2'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- adriana.brasil@voecostadosol.com.br | 3.6.6 - Operação com EFB - Eletronic Flight Bag | EdApp: 17/11/2025 10:40
SELECT 
  'adriana.brasil@voecostadosol.com.br' as email,
  'E5' as codigo_esperado,
  '2025-11-17' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-17' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E5'
  AND qh.deleted_at IS NULL
WHERE f.email = 'adriana.brasil@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.6.3 - Operações em Terrenos Desabitados ou Selva | EdApp: 04/10/2025 23:17
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'E6' as codigo_esperado,
  '2025-10-04' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-04' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E6'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.5 - Conhecimentos Gerais de Aeronaves | EdApp: 28/10/2025 23:50
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'B' as codigo_esperado,
  '2025-10-28' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-28' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'B'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.7 - Emergências Gerais | EdApp: 29/10/2025 02:17
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'C' as codigo_esperado,
  '2025-10-29' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-29' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'C'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.6.5 - Operação Aeromédica | EdApp: 29/10/2025 22:31
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'E4' as codigo_esperado,
  '2025-10-29' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-29' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E4'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.6.4 - Operação PBN - Navegação Baseada em Performance | EdApp: 31/10/2025 00:18
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'E2' as codigo_esperado,
  '2025-10-31' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-31' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E2'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.6.1 - Operações Offshore | EdApp: 01/11/2025 01:46
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'E1' as codigo_esperado,
  '2025-11-01' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-01' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E1'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antonio.ramos@voecostadosol.com.br | 3.6.6 - Operação com EFB - Eletronic Flight Bag | EdApp: 01/11/2025 20:08
SELECT 
  'antonio.ramos@voecostadosol.com.br' as email,
  'E5' as codigo_esperado,
  '2025-11-01' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-01' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E5'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antonio.ramos@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antunes.bernardo@voecostadosol.com.br | 3.7 - Emergências Gerais | EdApp: 19/11/2025 14:15
SELECT 
  'antunes.bernardo@voecostadosol.com.br' as email,
  'C' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'C'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antunes.bernardo@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- antunes.bernardo@voecostadosol.com.br | 3.5 - Conhecimentos Gerais de Aeronaves | EdApp: 19/11/2025 18:12
SELECT 
  'antunes.bernardo@voecostadosol.com.br' as email,
  'B' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'B'
  AND qh.deleted_at IS NULL
WHERE f.email = 'antunes.bernardo@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.6.3 - Operações em Terrenos Desabitados ou Selva | EdApp: 31/10/2025 19:47
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'E6' as codigo_esperado,
  '2025-10-31' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-10-31' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E6'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.5 - Conhecimentos Gerais de Aeronaves | EdApp: 03/11/2025 12:16
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'B' as codigo_esperado,
  '2025-11-03' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-03' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'B'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.7 - Emergências Gerais | EdApp: 03/11/2025 13:08
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'C' as codigo_esperado,
  '2025-11-03' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-03' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'C'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.6.5 - Operação Aeromédica | EdApp: 03/11/2025 13:15
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'E4' as codigo_esperado,
  '2025-11-03' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-03' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E4'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.6.1 - Operações Offshore | EdApp: 05/11/2025 11:57
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'E1' as codigo_esperado,
  '2025-11-05' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-05' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E1'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.6.6 - Operação com EFB - Eletronic Flight Bag | EdApp: 05/11/2025 12:01
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'E5' as codigo_esperado,
  '2025-11-05' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-05' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E5'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- caio.alcantara@voecostadosol.com.br | 3.6.4 - Operação PBN - Navegação Baseada em Performance | EdApp: 05/11/2025 17:53
SELECT 
  'caio.alcantara@voecostadosol.com.br' as email,
  'E2' as codigo_esperado,
  '2025-11-05' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-05' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E2'
  AND qh.deleted_at IS NULL
WHERE f.email = 'caio.alcantara@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- filipe.daumas@voecostadosol.com.br | 3.7 - Emergências Gerais | EdApp: 21/07/2025 12:06
SELECT 
  'filipe.daumas@voecostadosol.com.br' as email,
  'C' as codigo_esperado,
  '2025-07-21' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-07-21' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'C'
  AND qh.deleted_at IS NULL
WHERE f.email = 'filipe.daumas@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- filipe.daumas@voecostadosol.com.br | 3.5 - Conhecimentos Gerais de Aeronaves | EdApp: 28/08/2025 13:33
SELECT 
  'filipe.daumas@voecostadosol.com.br' as email,
  'B' as codigo_esperado,
  '2025-08-28' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-08-28' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'B'
  AND qh.deleted_at IS NULL
WHERE f.email = 'filipe.daumas@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.6.3 - Operações em Terrenos Desabitados ou Selva | EdApp: 04/09/2025 21:28
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'E6' as codigo_esperado,
  '2025-09-04' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-09-04' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E6'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.6.5 - Operação Aeromédica | EdApp: 19/11/2025 17:58
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'E4' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E4'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.7 - Emergências Gerais | EdApp: 19/11/2025 17:26
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'C' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'C'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.5 - Conhecimentos Gerais de Aeronaves | EdApp: 19/11/2025 16:13
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'B' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'B'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.6.6 - Operação com EFB - Eletronic Flight Bag | EdApp: 19/11/2025 21:49
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'E5' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E5'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.6.1 - Operações Offshore | EdApp: 20/11/2025 14:34
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'E1' as codigo_esperado,
  '2025-11-20' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-20' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E1'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;


-- dieter.kuhr@voecostadosol.com.br | 3.6.4 - Operação PBN - Navegação Baseada em Performance | EdApp: 19/11/2025 22:44
SELECT 
  'dieter.kuhr@voecostadosol.com.br' as email,
  'E2' as codigo_esperado,
  '2025-11-19' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '2025-11-19' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = 'E2'
  AND qh.deleted_at IS NULL
WHERE f.email = 'dieter.kuhr@voecostadosol.com.br'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;
