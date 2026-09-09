-- PREFLIGHT A-02: 0489_a02_natural_keys_tenant_scoped.sql
-- Provas read-only de que a migration 0489 pode ser aplicada com seguranca.

-- 1. Ausencia de duplicatas ilegais dentro do mesmo tenant para CPF
SELECT empresa_id, cpf COLLATE NOCASE as norm_cpf, COUNT(*) as qtd
FROM funcionarios
WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != ''
GROUP BY empresa_id, norm_cpf
HAVING COUNT(*) > 1;

-- 2. Ausencia de duplicatas ilegais dentro do mesmo tenant para Matricula
SELECT empresa_id, matricula COLLATE NOCASE as norm_mat, COUNT(*) as qtd
FROM funcionarios
WHERE deleted_at IS NULL AND matricula IS NOT NULL AND trim(matricula) != ''
GROUP BY empresa_id, norm_mat
HAVING COUNT(*) > 1;

-- 3. Ausencia de duplicatas ilegais dentro do mesmo tenant para Email
SELECT empresa_id, email COLLATE NOCASE as norm_email, COUNT(*) as qtd
FROM funcionarios
WHERE deleted_at IS NULL AND email IS NOT NULL AND trim(email) != ''
GROUP BY empresa_id, norm_email
HAVING COUNT(*) > 1;

-- 4. Repeticao legitima entre tenants que justifique as chaves tenant-scoped (CPF)
SELECT cpf COLLATE NOCASE as norm_cpf, COUNT(DISTINCT empresa_id) as qtd_tenants
FROM funcionarios
WHERE deleted_at IS NULL AND cpf IS NOT NULL AND trim(cpf) != ''
GROUP BY norm_cpf
HAVING COUNT(DISTINCT empresa_id) > 1;
