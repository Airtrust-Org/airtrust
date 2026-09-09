-- PREFLIGHT A-02: 0489_a02_natural_keys_tenant_scoped.sql
-- Read-only evidence. Any row returned by sections 1-3 is a NO-GO for apply.

-- 1. CPF: exact equality after the runtime has normalized CPF to digits.
SELECT empresa_id, cpf AS canonical_cpf, COUNT(*) AS qtd
FROM funcionarios
WHERE deleted_at IS NULL
  AND cpf IS NOT NULL
  AND trim(cpf) != ''
GROUP BY empresa_id, cpf
HAVING COUNT(*) > 1;

-- 2. Matricula: exact, case-sensitive equality. The canonical CRUD sanitizes
-- surrounding whitespace before persistence; this migration does not invent
-- case folding that the runtime does not currently use.
SELECT empresa_id, matricula AS canonical_matricula, COUNT(*) AS qtd
FROM funcionarios
WHERE deleted_at IS NULL
  AND matricula IS NOT NULL
  AND trim(matricula) != ''
GROUP BY empresa_id, matricula
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
