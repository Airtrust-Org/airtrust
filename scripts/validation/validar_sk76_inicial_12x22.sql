-- AIRTRUST VALIDATION QUERY (READ-ONLY)
-- Objetivo: validar vínculos SK76 Inicial (12 sessões x 22 manobras) após migrations 0372 e 0373.
-- Este arquivo NÃO é migration e NÃO deve ser usado para escrita em banco.
-- Não executar contra produção sem autorização explícita.

-- 1) Contagem por modelo (esperado: 22 em todos)
SELECT
  ms.codigo,
  ms.nome,
  COUNT(msm.id) AS total_vinculos,
  SUM(CASE WHEN m.id IS NULL THEN 1 ELSE 0 END) AS vinculos_sem_manobra,
  SUM(CASE WHEN m.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS vinculos_com_manobra_deletada
FROM modelos_sessao ms
LEFT JOIN modelos_sessao_manobras msm
  ON msm.modelo_id = ms.id
 AND msm.deleted_at IS NULL
LEFT JOIN manobras m
  ON m.id = msm.manobra_id
WHERE ms.codigo LIKE 'SK76-I-%/12'
  AND ms.deleted_at IS NULL
GROUP BY ms.id, ms.codigo, ms.nome
ORDER BY ms.codigo;

-- 2) Modelos fora do esperado (deve retornar 0 linhas)
SELECT
  ms.codigo,
  COUNT(msm.id) AS total_vinculos
FROM modelos_sessao ms
LEFT JOIN modelos_sessao_manobras msm
  ON msm.modelo_id = ms.id
 AND msm.deleted_at IS NULL
WHERE ms.codigo LIKE 'SK76-I-%/12'
  AND ms.deleted_at IS NULL
GROUP BY ms.id, ms.codigo
HAVING COUNT(msm.id) <> 22
ORDER BY ms.codigo;

-- 3) Duplicidade de ordem dentro do mesmo modelo (deve retornar 0 linhas)
SELECT
  ms.codigo,
  msm.ordem,
  COUNT(*) AS repeticoes
FROM modelos_sessao ms
JOIN modelos_sessao_manobras msm
  ON msm.modelo_id = ms.id
 AND msm.deleted_at IS NULL
WHERE ms.codigo LIKE 'SK76-I-%/12'
  AND ms.deleted_at IS NULL
GROUP BY ms.codigo, msm.ordem
HAVING COUNT(*) > 1
ORDER BY ms.codigo, msm.ordem;

-- 4) Duplicidade de manobra no mesmo modelo (deve retornar 0 linhas)
SELECT
  ms.codigo,
  m.codigo AS manobra_codigo,
  COUNT(*) AS repeticoes
FROM modelos_sessao ms
JOIN modelos_sessao_manobras msm
  ON msm.modelo_id = ms.id
 AND msm.deleted_at IS NULL
JOIN manobras m
  ON m.id = msm.manobra_id
WHERE ms.codigo LIKE 'SK76-I-%/12'
  AND ms.deleted_at IS NULL
GROUP BY ms.codigo, m.codigo
HAVING COUNT(*) > 1
ORDER BY ms.codigo, m.codigo;

-- 5) Check rápido: total geral esperado = 264
SELECT COUNT(*) AS total_geral_vinculos
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
WHERE ms.codigo LIKE 'SK76-I-%/12'
  AND ms.deleted_at IS NULL
  AND msm.deleted_at IS NULL;
