-- PREFLIGHT A-02: 0489_a02_natural_keys_tenant_scoped.sql
-- Provas read-only de que a migration 0489 pode ser aplicada com seguranca.

-- 1. Ausencia de duplicatas ilegais dentro do mesmo tenant para CPF
SELECT empresa_id, cpf, COUNT(*) as qtd
FROM funcionarios
WHERE deleted_at IS NULL AND cpf IS NOT NULL AND cpf != ''
GROUP BY empresa_id, cpf
HAVING COUNT(*) > 1;

-- 2. Ausencia de duplicatas ilegais dentro do mesmo tenant para Matricula
SELECT empresa_id, matricula, COUNT(*) as qtd
FROM funcionarios
WHERE deleted_at IS NULL AND matricula IS NOT NULL AND matricula != ''
GROUP BY empresa_id, matricula
HAVING COUNT(*) > 1;

-- 3. Repeticao legitima entre tenants que justifique a remocao das exclusividades globais
SELECT cpf, COUNT(DISTINCT empresa_id) as qtd_tenants
FROM funcionarios
WHERE deleted_at IS NULL AND cpf IS NOT NULL AND cpf != ''
GROUP BY cpf
HAVING COUNT(DISTINCT empresa_id) > 1;
