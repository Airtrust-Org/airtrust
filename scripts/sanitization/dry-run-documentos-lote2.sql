-- ============================================================
-- LOTE 2 DRY-RUN — documentos + pasta_virtual
-- Somente SELECT. Nenhuma escrita executada.
-- Referência: docs/AIRTRUST_DOCUMENTS_TENANT_RECONCILIATION_DRY_RUN_20260607.md
-- Commit base: 76bfd5c
-- ============================================================
-- SCHEMA confirmado:
--   documentos: id, uuid, funcionario_id, nome_arquivo, tipo, tamanho,
--               r2_key, descricao, empresa_id, created_at, updated_at, deleted_at
--   pasta_virtual: id, funcionario_id, tipo_documento, categoria, caminho_arquivo,
--                  arquivourl, nome_arquivo, nomeoriginal, arquivo_tamanho, tamanho,
--                  dataupload, created_at, updated_at, uploadedby, certificacao_id,
--                  descricao, empresa_id, deleted_at
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 1: Contagens base
-- ────────────────────────────────────────────────────────────

SELECT 'documentos' AS tabela,
  COUNT(*) AS total_fisico,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS ativos,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted,
  SUM(CASE WHEN empresa_id = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_1_ativos,
  SUM(CASE WHEN empresa_id = 1 AND deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS empresa_1_soft_del,
  SUM(CASE WHEN empresa_id = 6 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_6_ativos
FROM documentos
UNION ALL
SELECT 'pasta_virtual',
  COUNT(*),
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN (empresa_id IS NULL OR empresa_id = 1) AND deleted_at IS NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN (empresa_id IS NULL OR empresa_id = 1) AND deleted_at IS NOT NULL THEN 1 ELSE 0 END),
  SUM(CASE WHEN empresa_id = 6 AND deleted_at IS NULL THEN 1 ELSE 0 END)
FROM pasta_virtual;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 2: Candidatos documentos (nominais)
-- ────────────────────────────────────────────────────────────

SELECT
  d.id                                               AS documento_id,
  d.empresa_id                                       AS empresa_id_atual,
  6                                                  AS empresa_id_proposta,
  d.funcionario_id,
  f.empresa_id                                       AS funcionario_empresa_id,
  d.nome_arquivo,
  d.tipo                                             AS tipo_arquivo,
  d.r2_key,
  d.created_at,
  qh.id                                              AS historico_cert_id,
  CASE
    WHEN qh.id IS NOT NULL                           THEN 'TEM_HISTORICO_CERT'
    ELSE 'SEM_HISTORICO_CERT'
  END                                                AS vinculo_historico,
  CASE
    WHEN d.empresa_id = 1 AND f.empresa_id = 6       THEN 'TENANT_INCORRETO'
    ELSE 'REVISAR'
  END                                                AS classification,
  'ALTA'                                             AS confidence,
  'FK funcionario.empresa_id=6, doc.empresa_id=1'    AS evidence,
  'UPDATE documentos SET empresa_id=6 WHERE id=' || d.id AS action_sql,
  'UPDATE documentos SET empresa_id=1 WHERE id=' || d.id AS rollback_sql
FROM documentos d
INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.empresa_id = 6
LEFT  JOIN qualificacoes_historico qh
        ON qh.certificado_arquivo_id = d.id
       AND qh.deleted_at IS NULL
WHERE d.empresa_id = 1 AND d.deleted_at IS NULL
ORDER BY d.funcionario_id, d.created_at;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 3: Candidatos pasta_virtual (nominais)
-- ────────────────────────────────────────────────────────────

SELECT
  pv.id                                              AS pasta_id,
  pv.empresa_id                                      AS empresa_id_atual,
  6                                                  AS empresa_id_proposta,
  pv.funcionario_id,
  f.empresa_id                                       AS funcionario_empresa_id,
  pv.nome_arquivo,
  pv.tipo_documento,
  pv.categoria,
  pv.certificacao_id,
  pv.created_at,
  CASE
    WHEN pv.empresa_id IS NULL                       THEN 'NULL'
    WHEN pv.empresa_id = 1                           THEN 'EMPRESA_1'
    ELSE 'OUTRO'
  END                                                AS situacao_empresa_id,
  CASE
    WHEN pv.certificacao_id IS NOT NULL              THEN 'TEM_CERT_LINK'
    ELSE 'SEM_CERT_LINK'
  END                                                AS vinculo_cert,
  'TENANT_INCORRETO'                                 AS classification,
  'ALTA'                                             AS confidence,
  'FK funcionario.empresa_id=6, pv.empresa_id=1/NULL' AS evidence,
  'UPDATE pasta_virtual SET empresa_id=6 WHERE id=' || pv.id AS action_sql,
  'UPDATE pasta_virtual SET empresa_id=' ||
    COALESCE(CAST(pv.empresa_id AS TEXT), 'NULL') ||
    ' WHERE id=' || pv.id                            AS rollback_sql
FROM pasta_virtual pv
INNER JOIN funcionarios f ON f.id = pv.funcionario_id AND f.empresa_id = 6
WHERE (pv.empresa_id IS NULL OR pv.empresa_id = 1)
  AND pv.deleted_at IS NULL
ORDER BY pv.funcionario_id, pv.created_at;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 4: Correlação documentos ↔ pasta_virtual
-- ────────────────────────────────────────────────────────────

SELECT
  d.id AS doc_id, pv.id AS pv_id,
  d.funcionario_id,
  d.nome_arquivo,
  d.empresa_id AS d_empresa, pv.empresa_id AS pv_empresa
FROM documentos d
INNER JOIN pasta_virtual pv
        ON pv.nome_arquivo = d.nome_arquivo
       AND pv.funcionario_id = d.funcionario_id
       AND pv.deleted_at IS NULL
INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.empresa_id = 6
WHERE d.empresa_id = 1 AND d.deleted_at IS NULL
ORDER BY d.id
LIMIT 100;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 5: Soft-deleted (avaliação secundária)
-- ────────────────────────────────────────────────────────────

SELECT 'documentos_soft_del' AS origem, COUNT(*) AS total
FROM documentos d
INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.empresa_id = 6
WHERE d.empresa_id = 1 AND d.deleted_at IS NOT NULL
UNION ALL
SELECT 'pasta_virtual_soft_del', COUNT(*)
FROM pasta_virtual pv
INNER JOIN funcionarios f ON f.id = pv.funcionario_id AND f.empresa_id = 6
WHERE (pv.empresa_id IS NULL OR pv.empresa_id = 1) AND pv.deleted_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 6: Duplicatas exatas
-- ────────────────────────────────────────────────────────────

-- Documetos com mesmo nome, funcionário e r2_key em ambos tenants
SELECT d1.id AS id_e1, d6.id AS id_e6, d1.funcionario_id, d1.nome_arquivo, 'DUPLICADO' AS tipo
FROM documentos d1
INNER JOIN documentos d6
        ON d6.funcionario_id = d1.funcionario_id
       AND d6.nome_arquivo = d1.nome_arquivo
       AND d6.empresa_id = 6
       AND d6.deleted_at IS NULL
INNER JOIN funcionarios f ON f.id = d1.funcionario_id AND f.empresa_id = 6
WHERE d1.empresa_id = 1 AND d1.deleted_at IS NULL;
