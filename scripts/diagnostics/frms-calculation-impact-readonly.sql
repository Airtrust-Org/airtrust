-- FRMS calculation impact inventory — READ ONLY
-- Frente 13 -> Frente 10
-- Execute somente em SQLite/D1 local ou dump anonimizado autorizado.
-- Este arquivo não contém INSERT, UPDATE, DELETE, DDL, PRAGMA write ou transação de escrita.

-- 1. Visão geral da população FRMS por empresa e período.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  COUNT(*) AS jornadas,
  MIN(j.data) AS primeira_data,
  MAX(j.data) AS ultima_data
FROM frms_jornada j
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
WHERE j.deleted_at IS NULL
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 2. Jornadas que cruzam meia-noite pela convenção data da apresentação.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  COUNT(*) AS candidatas_cruzamento_meia_noite
FROM frms_jornada j
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
WHERE j.deleted_at IS NULL
  AND j.hora_apresentacao IS NOT NULL
  AND j.hora_termino IS NOT NULL
  AND j.hora_termino <= j.hora_apresentacao
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 3. Fatorizações explicitamente marcadas como processadas com bug.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  COUNT(*) AS fatorizacoes_processadas_com_bug
FROM frms_fatorizacao_jornada ff
JOIN frms_jornada j ON j.id = ff.jornada_id AND j.deleted_at IS NULL
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
WHERE ff.deleted_at IS NULL
  AND COALESCE(ff.processado_com_bug, 0) = 1
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 4. Repouso desconhecido tratado historicamente como suficiente.
SELECT
  f.empresa_id,
  substr(a.data_referencia, 1, 7) AS periodo,
  COUNT(*) AS repouso_desconhecido_fail_open
FROM frms_acumulo_rolling a
JOIN funcionarios f ON f.id = a.tripulante_id AND f.deleted_at IS NULL
WHERE a.repouso_anterior_min < 0
  AND a.repouso_suficiente = 1
GROUP BY f.empresa_id, substr(a.data_referencia, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 5. Jornada com voo registrado, mas HV de 24 h persistida como zero.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  COUNT(*) AS hv_corrente_possivelmente_excluida
FROM frms_jornada j
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
JOIN frms_acumulo_rolling a
  ON a.tripulante_id = j.tripulante_id
 AND a.data_referencia = j.data
WHERE j.deleted_at IS NULL
  AND COALESCE(j.horas_voo_minutos, 0) > 0
  AND COALESCE(a.hv_dia_min, 0) = 0
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 6. Escala dimensional incompatível: fator básico de HV fora da razão 0–1.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  COUNT(*) AS fator_hv_basica_fora_0_1,
  MIN(ff.fator_hv_basica_pct) AS menor_valor,
  MAX(ff.fator_hv_basica_pct) AS maior_valor
FROM frms_fatorizacao_jornada ff
JOIN frms_jornada j ON j.id = ff.jornada_id AND j.deleted_at IS NULL
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
WHERE ff.deleted_at IS NULL
  AND (ff.fator_hv_basica_pct < 0 OR ff.fator_hv_basica_pct > 1)
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 7. Possível dedução fixa de 60 minutos. É apenas candidato; a existência de
-- pausa deve ser verificada em fonte operacional antes de classificar como erro.
WITH duracoes AS (
  SELECT
    j.*,
    CASE
      WHEN j.hora_termino >= j.hora_apresentacao THEN
        (CAST(substr(j.hora_termino, 1, 2) AS INTEGER) * 60 + CAST(substr(j.hora_termino, 4, 2) AS INTEGER)) -
        (CAST(substr(j.hora_apresentacao, 1, 2) AS INTEGER) * 60 + CAST(substr(j.hora_apresentacao, 4, 2) AS INTEGER))
      ELSE
        1440 -
        (CAST(substr(j.hora_apresentacao, 1, 2) AS INTEGER) * 60 + CAST(substr(j.hora_apresentacao, 4, 2) AS INTEGER)) +
        (CAST(substr(j.hora_termino, 1, 2) AS INTEGER) * 60 + CAST(substr(j.hora_termino, 4, 2) AS INTEGER))
    END AS duracao_reconstruida_min
  FROM frms_jornada j
  WHERE j.deleted_at IS NULL
    AND j.hora_apresentacao IS NOT NULL
    AND j.hora_termino IS NOT NULL
)
SELECT
  f.empresa_id,
  substr(d.data, 1, 7) AS periodo,
  COUNT(*) AS possivel_deducao_fixa_60_min
FROM duracoes d
JOIN funcionarios f ON f.id = d.tripulante_id AND f.deleted_at IS NULL
WHERE d.duracao_jornada_minutos = d.duracao_reconstruida_min - 60
GROUP BY f.empresa_id, substr(d.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 8. Dados reais de despertar coexistindo com marcação de fonte padrão.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  COUNT(*) AS despertar_real_marcado_como_padrao
FROM frms_jornada j
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
WHERE j.deleted_at IS NULL
  AND j.hora_acordou IS NOT NULL
  AND COALESCE(j.fonte_sono, 'PADRAO') = 'PADRAO'
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 9. Saturação visual do effectiveness para posterior comparação do delta bruto.
SELECT
  f.empresa_id,
  substr(j.data, 1, 7) AS periodo,
  SUM(CASE WHEN ff.effectiveness_pct <= 0 THEN 1 ELSE 0 END) AS effectiveness_zero,
  SUM(CASE WHEN ff.effectiveness_pct >= 100 THEN 1 ELSE 0 END) AS effectiveness_cem,
  COUNT(*) AS total_fatorizacoes
FROM frms_fatorizacao_jornada ff
JOIN frms_jornada j ON j.id = ff.jornada_id AND j.deleted_at IS NULL
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
WHERE ff.deleted_at IS NULL
GROUP BY f.empresa_id, substr(j.data, 1, 7)
ORDER BY f.empresa_id, periodo;

-- 10. Amostra pseudonimizada para reconstrução local. Não retorna nome, email,
-- matrícula ou observação. O ID é transformado em prefixo hexadecimal não reversível
-- apenas quando a função hex estiver disponível no SQLite/D1 usado no diagnóstico.
SELECT
  f.empresa_id,
  substr(hex(j.id), 1, 12) AS jornada_hash,
  j.data,
  j.status,
  j.hora_apresentacao,
  j.hora_termino,
  j.duracao_jornada_minutos,
  j.horas_voo_minutos,
  a.repouso_anterior_min,
  a.repouso_suficiente,
  a.hv_dia_min,
  ff.fator_hv_basica_pct,
  ff.total_fatorizado_jornada,
  ff.total_fatorizado_hv,
  ff.effectiveness_pct,
  ff.processado_com_bug
FROM frms_jornada j
JOIN funcionarios f ON f.id = j.tripulante_id AND f.deleted_at IS NULL
LEFT JOIN frms_acumulo_rolling a
  ON a.tripulante_id = j.tripulante_id
 AND a.data_referencia = j.data
LEFT JOIN frms_fatorizacao_jornada ff
  ON ff.jornada_id = j.id
 AND ff.deleted_at IS NULL
WHERE j.deleted_at IS NULL
  AND (
    (j.hora_apresentacao IS NOT NULL AND j.hora_termino IS NOT NULL AND j.hora_termino <= j.hora_apresentacao)
    OR COALESCE(ff.processado_com_bug, 0) = 1
    OR (a.repouso_anterior_min < 0 AND a.repouso_suficiente = 1)
    OR (COALESCE(j.horas_voo_minutos, 0) > 0 AND COALESCE(a.hv_dia_min, 0) = 0)
    OR ff.fator_hv_basica_pct > 1
  )
ORDER BY f.empresa_id, j.data
LIMIT 200;
