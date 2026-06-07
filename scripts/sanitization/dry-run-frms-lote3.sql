-- ============================================================
-- LOTE 3 DRY-RUN — frms_jornada sem tenant
-- Somente SELECT / PRAGMA. Nenhuma escrita executada.
-- Referência: docs/AIRTRUST_FRMS_TENANT_RECONCILIATION_DRY_RUN_20260607.md
-- Commit base: 53c232b161ab9e7883be70e43e7bb35625015ee2
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 0: Schema real confirmado
-- ────────────────────────────────────────────────────────────

PRAGMA table_info(frms_jornada);
PRAGMA table_info(funcionarios);
PRAGMA table_info(frms_alerta);
PRAGMA table_info(frms_fadiga_checkin);
PRAGMA table_info(frms_fatorizacao_jornada);
PRAGMA table_info(horas_voo_lancamentos);
PRAGMA table_info(sgso_relatos);
PRAGMA table_info(escala_eventos);

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 1: Reconciliação de contagens gerais
-- ────────────────────────────────────────────────────────────

WITH base AS (
  SELECT
    j.id,
    j.empresa_id,
    j.deleted_at,
    j.tripulante_id,
    j.data,
    UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) AS origem_norm,
    j.observacao,
    f.id AS funcionario_id_real,
    f.empresa_id AS funcionario_empresa_id,
    f.deleted_at AS funcionario_deleted_at,
    COALESCE(f.ativo, 1) AS funcionario_ativo,
    UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) AS funcionario_status
  FROM frms_jornada j
  LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
)
SELECT
  COUNT(*) AS total_fisico,
  SUM(CASE WHEN empresa_id IS NULL THEN 1 ELSE 0 END) AS empresa_id_null_total,
  SUM(CASE WHEN empresa_id IS NULL AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_id_null_ativos,
  SUM(CASE WHEN empresa_id IS NULL AND deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS empresa_id_null_soft_deleted,
  SUM(CASE WHEN empresa_id = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_id_1_ativos,
  SUM(CASE WHEN empresa_id = 6 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS empresa_id_6_ativos,
  SUM(CASE WHEN deleted_at IS NULL AND empresa_id IS NOT NULL AND empresa_id NOT IN (1, 6) THEN 1 ELSE 0 END) AS empresa_id_outros_ativos,
  SUM(CASE
        WHEN empresa_id IS NULL
         AND deleted_at IS NULL
         AND funcionario_empresa_id = 6
         AND funcionario_deleted_at IS NULL
         AND funcionario_ativo = 1
         AND funcionario_status = 'ATIVO'
        THEN 1 ELSE 0 END) AS null_funcionario_empresa_6_ativo,
  SUM(CASE
        WHEN empresa_id IS NULL
         AND deleted_at IS NULL
         AND funcionario_empresa_id = 6
         AND funcionario_deleted_at IS NOT NULL
        THEN 1 ELSE 0 END) AS null_funcionario_empresa_6_soft_deleted,
  SUM(CASE
        WHEN empresa_id IS NULL
         AND deleted_at IS NULL
         AND funcionario_empresa_id = 6
         AND funcionario_deleted_at IS NULL
         AND NOT (funcionario_ativo = 1 AND funcionario_status = 'ATIVO')
        THEN 1 ELSE 0 END) AS null_funcionario_empresa_6_inativo_status,
  SUM(CASE WHEN empresa_id IS NULL AND deleted_at IS NULL AND funcionario_id_real IS NULL THEN 1 ELSE 0 END) AS null_funcionario_inexistente,
  SUM(CASE WHEN empresa_id IS NULL AND deleted_at IS NULL AND funcionario_id_real IS NOT NULL AND funcionario_empresa_id IS NULL THEN 1 ELSE 0 END) AS null_funcionario_sem_empresa,
  SUM(CASE
        WHEN empresa_id IS NULL
         AND deleted_at IS NULL
         AND funcionario_id_real IS NOT NULL
         AND funcionario_empresa_id IS NOT NULL
         AND funcionario_empresa_id <> 6
        THEN 1 ELSE 0 END) AS null_funcionario_outro_tenant,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted_total
FROM base;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 2: Classificação por origem
-- ────────────────────────────────────────────────────────────

WITH base AS (
  SELECT
    j.id,
    j.empresa_id,
    j.deleted_at,
    j.tripulante_id,
    j.data,
    UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) AS origem_norm,
    j.observacao,
    f.empresa_id AS funcionario_empresa_id,
    f.deleted_at AS funcionario_deleted_at,
    COALESCE(f.ativo, 1) AS funcionario_ativo,
    UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) AS funcionario_status
  FROM frms_jornada j
  LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
)
SELECT
  origem_norm AS origem,
  COUNT(*) AS total,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS ativos,
  SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS soft_deleted,
  COUNT(DISTINCT tripulante_id) AS funcionarios_distintos,
  MIN(data) AS periodo_inicio,
  MAX(data) AS periodo_fim,
  SUM(CASE
        WHEN empresa_id IS NULL
         AND deleted_at IS NULL
         AND funcionario_empresa_id = 6
         AND funcionario_deleted_at IS NULL
         AND funcionario_ativo = 1
         AND funcionario_status = 'ATIVO'
         AND (observacao IS NULL OR observacao NOT LIKE '%FIRA_HISTORICO%')
         AND NOT (COALESCE(duracao_jornada_minutos, 0) = 0 AND COALESCE(horas_voo_minutos, 0) > 0)
        THEN 1 ELSE 0 END) AS candidatos_automaticos
FROM (
  SELECT
    j.*,
    UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) AS origem_norm,
    f.empresa_id AS funcionario_empresa_id,
    f.deleted_at AS funcionario_deleted_at,
    COALESCE(f.ativo, 1) AS funcionario_ativo,
    UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) AS funcionario_status
  FROM frms_jornada j
  LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
)
GROUP BY origem_norm
ORDER BY ativos DESC, origem_norm ASC;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 3: Funcionários e inconsistências bloqueantes
-- ────────────────────────────────────────────────────────────

WITH candidate AS (
  SELECT
    j.id,
    j.data,
    UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) AS origem_norm,
    j.observacao,
    j.duracao_jornada_minutos,
    j.horas_voo_minutos,
    f.id AS funcionario_id_real,
    f.empresa_id AS funcionario_empresa_id,
    f.deleted_at AS funcionario_deleted_at,
    COALESCE(f.ativo, 1) AS funcionario_ativo,
    UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) AS funcionario_status
  FROM frms_jornada j
  LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
  WHERE j.empresa_id IS NULL
    AND j.deleted_at IS NULL
)
SELECT
  COUNT(*) AS candidatos_brutos,
  SUM(CASE
        WHEN funcionario_empresa_id = 6
         AND funcionario_deleted_at IS NULL
         AND funcionario_ativo = 1
         AND funcionario_status = 'ATIVO'
        THEN 1 ELSE 0 END) AS funcionario_empresa_6_ativo,
  SUM(CASE WHEN funcionario_empresa_id = 6 AND funcionario_deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS funcionario_empresa_6_soft_deleted,
  SUM(CASE
        WHEN funcionario_empresa_id = 6
         AND funcionario_deleted_at IS NULL
         AND NOT (funcionario_ativo = 1 AND funcionario_status = 'ATIVO')
        THEN 1 ELSE 0 END) AS funcionario_empresa_6_inativo_status,
  SUM(CASE WHEN funcionario_id_real IS NULL THEN 1 ELSE 0 END) AS funcionario_inexistente,
  SUM(CASE WHEN funcionario_id_real IS NOT NULL AND funcionario_empresa_id IS NULL THEN 1 ELSE 0 END) AS funcionario_sem_empresa,
  SUM(CASE WHEN funcionario_id_real IS NOT NULL AND funcionario_empresa_id IS NOT NULL AND funcionario_empresa_id <> 6 THEN 1 ELSE 0 END) AS funcionario_outro_tenant,
  SUM(CASE
        WHEN COALESCE(horas_voo_minutos, 0) > COALESCE(duracao_jornada_minutos, 0)
         AND COALESCE(duracao_jornada_minutos, 0) > 0
        THEN 1 ELSE 0 END) AS hv_maior_que_jornada,
  SUM(CASE
        WHEN COALESCE(duracao_jornada_minutos, 0) = 0
         AND COALESCE(horas_voo_minutos, 0) > 0
        THEN 1 ELSE 0 END) AS jornada_zero_hv_positiva,
  SUM(CASE WHEN data IS NULL OR TRIM(data) = '' THEN 1 ELSE 0 END) AS data_nula,
  SUM(CASE WHEN origem_norm = 'NULL' THEN 1 ELSE 0 END) AS origem_nula,
  SUM(CASE WHEN date(data) > date('now') THEN 1 ELSE 0 END) AS data_futura,
  SUM(CASE WHEN observacao LIKE '%FIRA_HISTORICO%' THEN 1 ELSE 0 END) AS afetados_0391
FROM candidate;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 4: Duplicidades
-- ────────────────────────────────────────────────────────────

WITH candidate AS (
  SELECT
    j.id,
    j.tripulante_id,
    j.data,
    UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) AS origem_norm,
    COALESCE(j.hora_apresentacao, 'NULL') AS hora_apresentacao_norm,
    COALESCE(j.hora_termino, 'NULL') AS hora_termino_norm,
    COALESCE(j.duracao_jornada_minutos, -1) AS duracao_norm,
    COALESCE(j.horas_voo_minutos, -1) AS hv_norm
  FROM frms_jornada j
  WHERE j.empresa_id IS NULL
    AND j.deleted_at IS NULL
),
exact_dupe_groups AS (
  SELECT
    tripulante_id,
    data,
    origem_norm,
    hora_apresentacao_norm,
    hora_termino_norm,
    duracao_norm,
    hv_norm,
    COUNT(*) AS cnt
  FROM candidate
  GROUP BY 1, 2, 3, 4, 5, 6, 7
  HAVING COUNT(*) > 1
),
probable_dupe_groups AS (
  SELECT
    tripulante_id,
    data,
    origem_norm,
    COUNT(*) AS cnt
  FROM candidate
  GROUP BY 1, 2, 3
  HAVING COUNT(*) > 1
)
SELECT
  COALESCE((SELECT SUM(cnt) FROM exact_dupe_groups), 0) AS duplicado_exato_linhas,
  COALESCE((SELECT COUNT(*) FROM exact_dupe_groups), 0) AS duplicado_exato_grupos,
  COALESCE((SELECT SUM(cnt) FROM probable_dupe_groups), 0) AS duplicado_provavel_linhas,
  COALESCE((SELECT COUNT(*) FROM probable_dupe_groups), 0) AS duplicado_provavel_grupos;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 5: Listagem nominal sanitizada
-- ────────────────────────────────────────────────────────────

WITH candidate AS (
  SELECT
    'frms_jornada' AS table_name,
    j.id,
    j.empresa_id AS empresa_id_atual,
    CAST(j.tripulante_id AS INTEGER) AS funcionario_id,
    f.empresa_id AS funcionario_empresa_id,
    f.deleted_at AS funcionario_deleted_at,
    f.nome AS funcionario_nome,
    j.data,
    UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) AS origem,
    j.status AS status_jornada,
    j.duracao_jornada_minutos,
    j.horas_voo_minutos,
    j.deleted_at,
    j.observacao,
    CASE
      WHEN COALESCE(j.horas_voo_minutos, 0) > COALESCE(j.duracao_jornada_minutos, 0)
       AND COALESCE(j.duracao_jornada_minutos, 0) > 0
      THEN 'BLOQUEANTE'
      WHEN COALESCE(j.duracao_jornada_minutos, 0) = 0
       AND COALESCE(j.horas_voo_minutos, 0) > 0
      THEN 'REQUER_REVISAO'
      WHEN j.data IS NULL OR TRIM(j.data) = ''
      THEN 'BLOQUEANTE'
      WHEN date(j.data) > date('now')
      THEN 'REQUER_REVISAO'
      WHEN UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) = 'NULL'
      THEN 'BLOQUEANTE'
      WHEN j.observacao LIKE '%FIRA_HISTORICO%'
      THEN 'REQUER_REVISAO'
      ELSE 'SEM_BLOQUEIO'
    END AS inconsistencia_status,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM frms_jornada dup
        WHERE dup.empresa_id IS NULL
          AND dup.deleted_at IS NULL
          AND dup.tripulante_id = j.tripulante_id
          AND dup.data = j.data
          AND UPPER(COALESCE(NULLIF(TRIM(dup.origem), ''), 'NULL')) = UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL'))
          AND COALESCE(dup.hora_apresentacao, 'NULL') = COALESCE(j.hora_apresentacao, 'NULL')
          AND COALESCE(dup.hora_termino, 'NULL') = COALESCE(j.hora_termino, 'NULL')
          AND COALESCE(dup.duracao_jornada_minutos, -1) = COALESCE(j.duracao_jornada_minutos, -1)
          AND COALESCE(dup.horas_voo_minutos, -1) = COALESCE(j.horas_voo_minutos, -1)
        GROUP BY dup.tripulante_id, dup.data, dup.origem, dup.hora_apresentacao, dup.hora_termino, dup.duracao_jornada_minutos, dup.horas_voo_minutos
        HAVING COUNT(*) > 1
      )
      THEN 'DUPLICADO_EXATO'
      ELSE 'SEM_DUPLICIDADE'
    END AS duplicidade_status,
    CASE
      WHEN j.deleted_at IS NOT NULL
      THEN 'SOFT_DELETED_VALIDO'
      WHEN f.id IS NULL
      THEN 'ORFAO'
      WHEN f.empresa_id <> 6
      THEN 'MANTER_NULL'
      WHEN f.deleted_at IS NOT NULL
      THEN 'REQUER_REVISAO_MANUAL'
      WHEN NOT (COALESCE(f.ativo, 1) = 1 AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO')
      THEN 'REQUER_REVISAO_MANUAL'
      WHEN j.observacao LIKE '%FIRA_HISTORICO%'
      THEN 'REQUER_REVISAO_MANUAL'
      WHEN COALESCE(j.horas_voo_minutos, 0) > COALESCE(j.duracao_jornada_minutos, 0)
       AND COALESCE(j.duracao_jornada_minutos, 0) > 0
      THEN 'INCONSISTENTE'
      WHEN COALESCE(j.duracao_jornada_minutos, 0) = 0
       AND COALESCE(j.horas_voo_minutos, 0) > 0
      THEN 'INCONSISTENTE'
      WHEN EXISTS (
        SELECT 1
        FROM frms_jornada dup
        WHERE dup.empresa_id IS NULL
          AND dup.deleted_at IS NULL
          AND dup.tripulante_id = j.tripulante_id
          AND dup.data = j.data
          AND UPPER(COALESCE(NULLIF(TRIM(dup.origem), ''), 'NULL')) = UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL'))
          AND COALESCE(dup.hora_apresentacao, 'NULL') = COALESCE(j.hora_apresentacao, 'NULL')
          AND COALESCE(dup.hora_termino, 'NULL') = COALESCE(j.hora_termino, 'NULL')
          AND COALESCE(dup.duracao_jornada_minutos, -1) = COALESCE(j.duracao_jornada_minutos, -1)
          AND COALESCE(dup.horas_voo_minutos, -1) = COALESCE(j.horas_voo_minutos, -1)
        GROUP BY dup.tripulante_id, dup.data, dup.origem, dup.hora_apresentacao, dup.hora_termino, dup.duracao_jornada_minutos, dup.horas_voo_minutos
        HAVING COUNT(*) > 1
      )
      THEN 'DUPLICADO'
      WHEN j.empresa_id IS NULL
      THEN 'TENANT_INCORRETO'
      ELSE 'MANTER'
    END AS classification,
    CASE
      WHEN j.deleted_at IS NULL
       AND f.empresa_id = 6
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
       AND (j.observacao IS NULL OR j.observacao NOT LIKE '%FIRA_HISTORICO%')
       AND NOT (COALESCE(j.horas_voo_minutos, 0) > COALESCE(j.duracao_jornada_minutos, 0) AND COALESCE(j.duracao_jornada_minutos, 0) > 0)
       AND NOT (COALESCE(j.duracao_jornada_minutos, 0) = 0 AND COALESCE(j.horas_voo_minutos, 0) > 0)
       AND NOT EXISTS (
         SELECT 1
         FROM frms_jornada dup
         WHERE dup.empresa_id IS NULL
           AND dup.deleted_at IS NULL
           AND dup.tripulante_id = j.tripulante_id
           AND dup.data = j.data
           AND UPPER(COALESCE(NULLIF(TRIM(dup.origem), ''), 'NULL')) = UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL'))
           AND COALESCE(dup.hora_apresentacao, 'NULL') = COALESCE(j.hora_apresentacao, 'NULL')
           AND COALESCE(dup.hora_termino, 'NULL') = COALESCE(j.hora_termino, 'NULL')
           AND COALESCE(dup.duracao_jornada_minutos, -1) = COALESCE(j.duracao_jornada_minutos, -1)
           AND COALESCE(dup.horas_voo_minutos, -1) = COALESCE(j.horas_voo_minutos, -1)
         GROUP BY dup.tripulante_id, dup.data, dup.origem, dup.hora_apresentacao, dup.hora_termino, dup.duracao_jornada_minutos, dup.horas_voo_minutos
         HAVING COUNT(*) > 1
       )
      THEN 'ALTA'
      WHEN f.empresa_id = 6
      THEN 'MEDIA'
      ELSE 'BAIXA'
    END AS confidence,
    CASE
      WHEN j.observacao LIKE '%FIRA_HISTORICO%'
      THEN '0391_LABEL_PRESENTE'
      WHEN NOT (COALESCE(f.ativo, 1) = 1 AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO')
      THEN 'FUNCIONARIO_INATIVO'
      WHEN COALESCE(j.duracao_jornada_minutos, 0) = 0 AND COALESCE(j.horas_voo_minutos, 0) > 0
      THEN 'JORNADA_ZERO_HV_POSITIVA'
      WHEN j.empresa_id IS NULL AND f.empresa_id = 6
      THEN 'FK funcionario.empresa_id=6, frms_jornada.empresa_id IS NULL'
      ELSE 'REVISAR'
    END AS evidence,
    CASE
      WHEN j.empresa_id IS NULL
       AND j.deleted_at IS NULL
       AND f.empresa_id = 6
       AND f.deleted_at IS NULL
       AND COALESCE(f.ativo, 1) = 1
       AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
       AND (j.observacao IS NULL OR j.observacao NOT LIKE '%FIRA_HISTORICO%')
       AND NOT (COALESCE(j.horas_voo_minutos, 0) > COALESCE(j.duracao_jornada_minutos, 0) AND COALESCE(j.duracao_jornada_minutos, 0) > 0)
       AND NOT (COALESCE(j.duracao_jornada_minutos, 0) = 0 AND COALESCE(j.horas_voo_minutos, 0) > 0)
      THEN 'UPDATE frms_jornada SET empresa_id = 6, updated_at = datetime(''now'') WHERE id = ''' || j.id || ''';'
      ELSE 'NAO_APLICAR_AUTOMATICAMENTE'
    END AS action,
    CASE
      WHEN j.empresa_id IS NULL
      THEN 'UPDATE frms_jornada SET empresa_id = NULL, updated_at = datetime(''now'') WHERE id = ''' || j.id || ''';'
      ELSE 'SEM_ROLLBACK'
    END AS rollback_action
  FROM frms_jornada j
  LEFT JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
  WHERE j.empresa_id IS NULL
)
SELECT
  table_name AS "table",
  id,
  empresa_id_atual,
  CASE WHEN classification = 'TENANT_INCORRETO' AND confidence = 'ALTA' THEN 6 ELSE NULL END AS empresa_id_proposta,
  funcionario_id,
  funcionario_empresa_id,
  funcionario_deleted_at,
  data,
  origem,
  status_jornada,
  duracao_jornada_minutos,
  horas_voo_minutos,
  deleted_at,
  duplicidade_status,
  inconsistencia_status,
  classification,
  confidence,
  evidence,
  action,
  rollback_action
FROM candidate
ORDER BY
  CASE classification
    WHEN 'TENANT_INCORRETO' THEN 1
    WHEN 'REQUER_REVISAO_MANUAL' THEN 2
    WHEN 'INCONSISTENTE' THEN 3
    WHEN 'DUPLICADO' THEN 4
    ELSE 9
  END,
  origem,
  data,
  funcionario_nome,
  id;

-- ────────────────────────────────────────────────────────────
-- SEÇÃO 6: Impacto relacional imediato
-- ────────────────────────────────────────────────────────────

WITH auto_candidates AS (
  SELECT j.id, CAST(j.tripulante_id AS INTEGER) AS tripulante_id, j.data
  FROM frms_jornada j
  JOIN funcionarios f ON f.id = CAST(j.tripulante_id AS INTEGER)
  WHERE j.empresa_id IS NULL
    AND j.deleted_at IS NULL
    AND f.empresa_id = 6
    AND f.deleted_at IS NULL
    AND COALESCE(f.ativo, 1) = 1
    AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
    AND NOT (COALESCE(j.horas_voo_minutos, 0) > COALESCE(j.duracao_jornada_minutos, 0) AND COALESCE(j.duracao_jornada_minutos, 0) > 0)
    AND NOT (COALESCE(j.duracao_jornada_minutos, 0) = 0 AND COALESCE(j.horas_voo_minutos, 0) > 0)
    AND j.data IS NOT NULL
    AND TRIM(j.data) <> ''
    AND date(j.data) <= date('now')
    AND UPPER(COALESCE(NULLIF(TRIM(j.origem), ''), 'NULL')) <> 'NULL'
    AND (j.observacao IS NULL OR j.observacao NOT LIKE '%FIRA_HISTORICO%')
)
SELECT
  (SELECT COUNT(*) FROM auto_candidates) AS auto_total,
  (SELECT COUNT(*) FROM frms_fatorizacao_jornada ffj JOIN auto_candidates ac ON ac.id = ffj.jornada_id WHERE ffj.deleted_at IS NULL) AS fatorizacao_rows,
  (SELECT COUNT(DISTINCT ac.id) FROM frms_fatorizacao_jornada ffj JOIN auto_candidates ac ON ac.id = ffj.jornada_id WHERE ffj.deleted_at IS NULL) AS fatorizacao_jornadas,
  (SELECT COUNT(*) FROM frms_alerta a JOIN auto_candidates ac ON ac.id = a.jornada_id WHERE a.deleted_at IS NULL) AS alerta_rows,
  (SELECT COUNT(DISTINCT ac.id) FROM frms_alerta a JOIN auto_candidates ac ON ac.id = a.jornada_id WHERE a.deleted_at IS NULL) AS alerta_jornadas,
  (SELECT COUNT(*) FROM frms_fadiga_checkin ch JOIN auto_candidates ac ON ac.tripulante_id = ch.funcionario_id AND ac.data = ch.data_checkin WHERE ch.empresa_id = 6 AND ch.deleted_at IS NULL) AS checkins_mesmo_dia_empresa_6,
  (SELECT COUNT(*) FROM horas_voo_lancamentos h JOIN auto_candidates ac ON CAST(ac.id AS TEXT) = CAST(h.frms_jornada_id AS TEXT) WHERE h.deleted_at IS NULL) AS horas_voo_rows,
  (SELECT COUNT(*) FROM sgso_relatos s JOIN auto_candidates ac ON CAST(ac.id AS TEXT) = CAST(s.frms_jornada_id AS TEXT) WHERE s.deleted_at IS NULL) AS sgso_rows;
