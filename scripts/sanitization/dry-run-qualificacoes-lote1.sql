-- ============================================================
-- LOTE 1 DRY-RUN — qualificacoes_historico + qualificacoes_tipos
-- Somente SELECT. Nenhuma escrita executada.
-- Referência: docs/AIRTRUST_QUALIFICATION_TENANT_RECONCILIATION_DRY_RUN_20260607.md
-- Commit base: 3ca7b7264fcd4124e8588743ee05a32e71a84337
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 1: Reconciliação de contagens
-- ────────────────────────────────────────────────────────────

-- 1A. Visão geral de qualificacoes_historico
SELECT
  COUNT(*) AS total_fisico,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS ativos,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted,
  SUM(CASE WHEN empresa_id = 1 THEN 1 ELSE 0 END) AS empresa_1_total,
  SUM(CASE WHEN empresa_id = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_1_ativos,
  SUM(CASE WHEN empresa_id = 1 AND deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS empresa_1_soft_deleted,
  SUM(CASE WHEN empresa_id = 6 THEN 1 ELSE 0 END) AS empresa_6_total,
  SUM(CASE WHEN empresa_id = 6 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_6_ativos
FROM qualificacoes_historico;

-- 1B. Candidatos e1→e6: total por status (ativos e soft-deleted)
SELECT
  COALESCE(qh.status, 'NULL') AS status,
  COUNT(*) AS total,
  SUM(CASE WHEN qh.deleted_at IS NULL THEN 1 ELSE 0 END) AS ativos,
  SUM(CASE WHEN qh.deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.empresa_id = 1
GROUP BY qh.status
ORDER BY ativos DESC;

-- 1C. Duplicatas exatas (mesmo funcionario + codigo + data_conclusao nos dois tenants)
-- Esperado: 0 linhas
SELECT
  qh1.id AS id_e1,
  qh1.funcionario_id,
  qh1.qualificacao_codigo AS codigo,
  qh1.data_conclusao,
  qh6.id AS id_e6_duplicado,
  'DUPLICADO_EXATO' AS tipo_alerta
FROM qualificacoes_historico qh1
INNER JOIN funcionarios f ON f.id = qh1.funcionario_id AND f.empresa_id = 6
INNER JOIN qualificacoes_historico qh6
  ON qh6.funcionario_id = qh1.funcionario_id
  AND qh6.qualificacao_codigo = qh1.qualificacao_codigo
  AND qh6.empresa_id = 6
  AND qh6.deleted_at IS NULL
  AND qh6.data_conclusao = qh1.data_conclusao
WHERE qh1.empresa_id = 1
  AND qh1.deleted_at IS NULL;

-- 1D. Candidatos com sessao_id (complicam a movimentação)
-- Esperado: 0 linhas
SELECT COUNT(*) AS com_sessao_id
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.empresa_id = 1
  AND qh.deleted_at IS NULL
  AND qh.sessao_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 2: Listagem nominal completa de candidatos ATIVOS
-- ────────────────────────────────────────────────────────────

SELECT
  qh.id,
  qh.empresa_id                                                AS empresa_id_atual,
  6                                                            AS empresa_id_proposta,
  qh.funcionario_id,
  f.nome                                                       AS funcionario_nome,
  f.empresa_id                                                 AS funcionario_empresa_id,
  qh.qualificacao_id                                           AS tipo_id,
  qt.empresa_id                                                AS tipo_empresa_id,
  qt.nome                                                      AS tipo_nome,
  qt.codigo                                                    AS tipo_codigo,
  COALESCE(qh.qualificacao_codigo, qt.codigo)                  AS codigo_efetivo,
  qh.status,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.renovada                                                  AS renovada_flag,
  qh.sessao_id,
  CASE
    WHEN qh.sessao_id IS NOT NULL THEN 'REQUER_REVISAO_MANUAL'
    WHEN EXISTS (
      SELECT 1 FROM qualificacoes_historico dup
      WHERE dup.funcionario_id = qh.funcionario_id
        AND dup.qualificacao_codigo = qh.qualificacao_codigo
        AND dup.empresa_id = 6
        AND dup.deleted_at IS NULL
        AND dup.data_conclusao = qh.data_conclusao
    )                                                          THEN 'DUPLICADO_EXATO'
    WHEN f.empresa_id = 6 AND qh.empresa_id = 1               THEN 'TENANT_INCORRETO'
    ELSE 'REVISAR'
  END                                                          AS classification,
  CASE
    WHEN qh.sessao_id IS NOT NULL                              THEN 'MEDIA'
    WHEN f.empresa_id = 6 AND qh.empresa_id = 1               THEN 'ALTA'
    ELSE 'BAIXA'
  END                                                          AS confidence,
  'FK funcionario.empresa_id=6, qh.empresa_id=1'               AS evidence,
  'UPDATE qualificacoes_historico SET empresa_id=6 WHERE id=' || qh.id AS action_sql,
  'UPDATE qualificacoes_historico SET empresa_id=1 WHERE id=' || qh.id AS rollback_sql
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
LEFT  JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
WHERE qh.empresa_id = 1
  AND qh.deleted_at IS NULL
ORDER BY f.nome, COALESCE(qh.qualificacao_codigo, qt.codigo), qh.data_conclusao;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 3: Candidatos SOFT-DELETED (avaliação secundária)
-- ────────────────────────────────────────────────────────────

SELECT
  qh.id,
  qh.empresa_id                                          AS empresa_id_atual,
  qh.funcionario_id,
  f.nome                                                 AS funcionario_nome,
  qh.qualificacao_codigo                                 AS codigo,
  qh.status,
  qh.data_conclusao,
  qh.deleted_at,
  CASE
    WHEN qh.funcionario_id = 0 OR f.id IS NULL           THEN 'ORFAO'
    WHEN f.empresa_id = 6 AND qh.empresa_id = 1          THEN 'TENANT_INCORRETO_SOFT_DELETED'
    ELSE 'REVISAR'
  END                                                    AS classification
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON f.id = qh.funcionario_id
WHERE qh.empresa_id = 1
  AND qh.deleted_at IS NOT NULL
ORDER BY qh.deleted_at DESC;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 4: Tipos de qualificação — análise de movimentação
-- ────────────────────────────────────────────────────────────

-- 4A. Tipos em empresa_id=1 com contagem de uso em cada tenant
SELECT
  qt.id,
  qt.empresa_id                                            AS empresa_id_atual,
  qt.codigo,
  qt.nome,
  qt.categoria,
  qt.validade,
  qt.ativo,
  qt.deleted_at IS NOT NULL                                AS is_deleted,
  SUM(CASE WHEN qh.empresa_id = 1 AND qh.deleted_at IS NULL THEN 1 ELSE 0 END) AS uso_e1_ativo,
  SUM(CASE WHEN qh.empresa_id = 6 AND qh.deleted_at IS NULL THEN 1 ELSE 0 END) AS uso_e6_ativo,
  CASE
    WHEN SUM(CASE WHEN qh.empresa_id = 6 AND qh.deleted_at IS NULL THEN 1 ELSE 0 END) = 0
     AND SUM(CASE WHEN qh.empresa_id = 1 AND qh.deleted_at IS NULL THEN 1 ELSE 0 END) > 0
                                                           THEN 'MOVER_PARA_E6_EXCLUSIVO'
    WHEN SUM(CASE WHEN qh.empresa_id = 6 AND qh.deleted_at IS NULL THEN 1 ELSE 0 END) > 0
                                                           THEN 'MOVER_PARA_E6_COMPARTILHADO'
    ELSE 'SEM_USO_ATIVO'
  END                                                      AS acao_recomendada,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM qualificacoes_tipos qt2
      WHERE qt2.codigo = qt.codigo AND qt2.empresa_id = 6 AND qt2.deleted_at IS NULL
    )                                                      THEN 'SEM_CONFLITO_CODIGO'
    ELSE 'CODIGO_DUPLICADO_BLOQUEANTE'
  END                                                      AS conflito_codigo
FROM qualificacoes_tipos qt
LEFT JOIN qualificacoes_historico qh ON qh.qualificacao_id = qt.id
WHERE qt.empresa_id = 1
  AND qt.deleted_at IS NULL
GROUP BY qt.id, qt.empresa_id, qt.codigo, qt.nome, qt.categoria, qt.validade, qt.ativo, qt.deleted_at
ORDER BY uso_e1_ativo DESC, uso_e6_ativo DESC;

-- 4B. Verificação de conflito de código para os candidatos
-- Esperado: 0 conflitos
SELECT
  qt1.id    AS tipo_id_e1,
  qt1.codigo,
  qt2.id    AS tipo_id_e6_conflito,
  qt2.nome  AS nome_e6,
  'CONFLITO_BLOQUEANTE' AS alerta
FROM qualificacoes_tipos qt1
INNER JOIN qualificacoes_tipos qt2
  ON UPPER(qt2.codigo) = UPPER(qt1.codigo)
  AND qt2.empresa_id = 6
  AND qt2.deleted_at IS NULL
WHERE qt1.empresa_id = 1
  AND qt1.deleted_at IS NULL
  AND qt1.id IN (105, 106, 110, 111, 112, 113, 114, 115);

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 5: Cadeias de renovação cruzadas
-- ────────────────────────────────────────────────────────────

-- 5A. Registros RENOVADA em e1 cujo successor já existe em e6
SELECT
  qh1.id         AS id_e1_renovado,
  qh1.funcionario_id,
  f.nome         AS funcionario_nome,
  qh1.qualificacao_codigo AS codigo,
  qh1.data_conclusao     AS data_original,
  qh1.data_vencimento    AS venc_original,
  qh1.status             AS status_e1,
  qh_novo.id             AS id_renovacao_e6,
  qh_novo.empresa_id     AS empresa_renovacao,
  qh_novo.data_conclusao AS data_renovacao,
  qh_novo.data_vencimento AS venc_renovacao,
  qh_novo.status         AS status_novo,
  'CADEIA_CRUZADA_NORMAL' AS classificacao,
  'Após move: ambas as pontas estarão em e6' AS observacao
FROM qualificacoes_historico qh1
INNER JOIN funcionarios f ON f.id = qh1.funcionario_id AND f.empresa_id = 6
INNER JOIN qualificacoes_historico qh_novo
  ON qh_novo.funcionario_id = qh1.funcionario_id
  AND qh_novo.qualificacao_codigo = qh1.qualificacao_codigo
  AND qh_novo.empresa_id = 6
  AND qh_novo.deleted_at IS NULL
  AND qh_novo.data_conclusao > qh1.data_conclusao
WHERE qh1.empresa_id = 1
  AND qh1.deleted_at IS NULL
ORDER BY qh1.funcionario_id, qh1.qualificacao_codigo;

-- 5B. Impacto no contador Renovadas após o saneamento
SELECT
  'Antes (status=RENOVADA em empresa_id=1 + empresa_id=6, via join funcionario)' AS cenario,
  COUNT(*) AS total
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.status = 'RENOVADA'
  AND qh.deleted_at IS NULL

UNION ALL

SELECT
  'Depois (status=RENOVADA apenas em empresa_id=6 após move)' AS cenario,
  (SELECT COUNT(*)
   FROM qualificacoes_historico
   WHERE empresa_id = 6 AND status = 'RENOVADA' AND deleted_at IS NULL)
  + (SELECT COUNT(*)
     FROM qualificacoes_historico qh
     INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
     WHERE qh.empresa_id = 1 AND qh.status = 'RENOVADA' AND qh.deleted_at IS NULL) AS total;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 6: Verificação de planejadas
-- ────────────────────────────────────────────────────────────

SELECT
  qh.id,
  qh.empresa_id,
  qh.funcionario_id,
  qh.qualificacao_codigo AS codigo,
  qh.status,
  qh.data_conclusao,
  qh.deleted_at,
  CASE WHEN qh.deleted_at IS NULL THEN 'ATIVA' ELSE 'SOFT_DELETED' END AS situacao
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.empresa_id = 1
  AND qh.status = 'PLANEJADA';

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 7: Impacto estimado nos contadores da UI
-- ────────────────────────────────────────────────────────────

-- Contadores Renovadas: hoje (via join) vs após move (via empresa_id=6)
SELECT 'renovadas_via_join_hoje' AS metrica,
  COUNT(*) AS valor
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.deleted_at IS NULL AND qh.status = 'RENOVADA'

UNION ALL

SELECT 'renovadas_empresa_id_6_hoje' AS metrica,
  COUNT(*) AS valor
FROM qualificacoes_historico
WHERE empresa_id = 6 AND deleted_at IS NULL AND status = 'RENOVADA'

UNION ALL

SELECT 'renovadas_empresa_id_1_candidatas' AS metrica,
  COUNT(*) AS valor
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.empresa_id = 1 AND qh.deleted_at IS NULL AND qh.status = 'RENOVADA'

UNION ALL

SELECT 'total_ativos_via_join_hoje' AS metrica,
  COUNT(*) AS valor
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = 6
WHERE qh.deleted_at IS NULL

UNION ALL

SELECT 'total_ativos_empresa_id_6_hoje' AS metrica,
  COUNT(*) AS valor
FROM qualificacoes_historico
WHERE empresa_id = 6 AND deleted_at IS NULL;
