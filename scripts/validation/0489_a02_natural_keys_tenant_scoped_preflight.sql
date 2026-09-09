-- PREFLIGHT A-02: 0489_a02_natural_keys_tenant_scoped.sql
-- Read-only evidence.
-- Any row returned by sections 1-3 or 5-7 is a NO-GO for apply.
-- Section 4 is informational only.

-- 1. CPF: exact equality after the runtime has normalized CPF to digits.
SELECT empresa_id, cpf AS canonical_cpf, COUNT(*) AS qtd
FROM funcionarios
WHERE deleted_at IS NULL
  AND cpf IS NOT NULL
  AND trim(cpf) != ''
GROUP BY empresa_id, cpf
HAVING COUNT(*) > 1;

-- 2. Matricula: trim-insensitive, case-sensitive identity.
SELECT empresa_id, TRIM(matricula) AS canonical_matricula, COUNT(*) AS qtd
FROM funcionarios
WHERE deleted_at IS NULL
  AND matricula IS NOT NULL
  AND trim(matricula) != ''
GROUP BY empresa_id, TRIM(matricula)
HAVING COUNT(*) > 1;

-- 3. Email: canonical identity/linkage uses LOWER(TRIM(email)).
SELECT empresa_id, LOWER(TRIM(email)) AS canonical_email, COUNT(*) AS qtd
FROM funcionarios
WHERE deleted_at IS NULL
  AND email IS NOT NULL
  AND trim(email) != ''
GROUP BY empresa_id, LOWER(TRIM(email))
HAVING COUNT(*) > 1;

-- 4. Informational only: legitimate reuse across tenants must remain possible.
SELECT cpf AS canonical_cpf, COUNT(DISTINCT empresa_id) AS qtd_tenants
FROM funcionarios
WHERE deleted_at IS NULL
  AND cpf IS NOT NULL
  AND trim(cpf) != ''
GROUP BY cpf
HAVING COUNT(DISTINCT empresa_id) > 1;

-- 5. NO-GO legacy data drift: active CPF values must already be in the
-- canonical digits-only representation used by current runtime writers.
SELECT id, empresa_id, cpf
FROM funcionarios
WHERE deleted_at IS NULL
  AND cpf IS NOT NULL
  AND trim(cpf) != ''
  AND cpf GLOB '*[^0-9]*';

-- 6. NO-GO legacy data drift: the DB constraint canonicalizes surrounding
-- whitespace for matricula. Existing active rows with non-canonical whitespace
-- must be reviewed before apply.
SELECT id, empresa_id, matricula
FROM funcionarios
WHERE deleted_at IS NULL
  AND matricula IS NOT NULL
  AND trim(matricula) != ''
  AND matricula <> TRIM(matricula);

-- 7. NO-GO schema drift: these historical names were UNIQUE in some old
-- migrations but were also recreated as non-unique performance indexes in
-- other historical states. Canonical current bootstrap does not contain them.
-- If either exists in the target environment, inspect metadata before apply.
SELECT name, sql
FROM sqlite_master
WHERE type = 'index'
  AND name IN ('idx_funcionarios_cpf', 'idx_funcionarios_matricula');
