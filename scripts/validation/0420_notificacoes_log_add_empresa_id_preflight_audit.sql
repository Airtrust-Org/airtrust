-- PREFLIGHT AUDIT para 0420_notificacoes_log_add_empresa_id.sql
-- Somente leitura. Rodar SEPARADAMENTE, em cada ambiente, ANTES da migration.
-- Não faz parte da sequência de migrations (não deve ser registrado no ledger
-- d1_migrations) — é uma ferramenta de decisão manual para o operador.

-- 1. A coluna já existe? Se "empresa_id" aparecer aqui, NÃO rode a migration —
--    ela vai falhar em ALTER TABLE (ou, pior, já foi aplicada por fora do fluxo
--    numerado e o ledger pode estar desalinhado).
PRAGMA table_info(notificacoes_log);

-- 2. Existe algum CPF ativo compartilhado por mais de uma empresa? O backfill
--    normalizado usa um tie-break determinístico (menor funcionarios.id) para
--    esses casos, mas isso é uma rede de segurança, não uma resolução correta —
--    se o resultado abaixo for > 0, decida manualmente antes de prosseguir.
SELECT COUNT(*) AS cpfs_duplicados_entre_empresas
FROM (
  SELECT REPLACE(REPLACE(cpf, '.', ''), '-', '') AS cpf_norm
  FROM funcionarios
  WHERE deleted_at IS NULL AND cpf IS NOT NULL
  GROUP BY cpf_norm
  HAVING COUNT(DISTINCT empresa_id) > 1
);

-- 3. Quantas linhas de notificacoes_log NÃO vão encontrar match nem com CPF
--    normalizado? Essas ficarão com empresa_id NULL após a migration — invisíveis
--    sob o filtro tenant-scoped da aplicação. Investigar antes de prosseguir se
--    esse número for material (em produção, 2026-07-09: 0).
SELECT COUNT(*) AS unmatched_apos_normalizacao
FROM notificacoes_log nl
WHERE nl.funcionario_cpf IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios f
    WHERE REPLACE(REPLACE(f.cpf, '.', ''), '-', '') =
          REPLACE(REPLACE(nl.funcionario_cpf, '.', ''), '-', '')
      AND f.deleted_at IS NULL
  );

-- 4. Quantas linhas têm funcionario_cpf NULL (nunca terão empresa_id via este
--    backfill — esperado, não é um bug; são notificações sem funcionário
--    associado)?
SELECT COUNT(*) AS cpf_nulo
FROM notificacoes_log
WHERE funcionario_cpf IS NULL;

-- 5. Volume total, para dimensionar o tempo do UPDATE.
SELECT COUNT(*) AS total_linhas FROM notificacoes_log;
