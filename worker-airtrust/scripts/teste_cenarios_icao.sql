-- Validação ICAO/FAA pós-correção FRMS

SELECT 'CENARIO_1_DIURNA' AS teste,
  ROUND(AVG(fj.effectiveness_pct), 1) AS media_pct,
  COUNT(*) AS amostras,
  COUNT(CASE WHEN j.hora_apresentacao BETWEEN '07:00' AND '17:00' THEN 1 END) AS diurnas
FROM frms_fatorizacao_jornada fj
JOIN frms_jornada j ON j.id = fj.jornada_id
WHERE fj.deleted_at IS NULL
  AND j.deleted_at IS NULL
  AND j.data >= date('now', '-30 days')
  AND j.hora_apresentacao BETWEEN '07:00' AND '17:00';

SELECT 'CENARIO_2_NOTURNA' AS teste,
  ROUND(AVG(fj.effectiveness_pct), 1) AS media_pct,
  COUNT(*) AS amostras
FROM frms_fatorizacao_jornada fj
JOIN frms_jornada j ON j.id = fj.jornada_id
WHERE fj.deleted_at IS NULL
  AND j.deleted_at IS NULL
  AND (
    j.hora_apresentacao BETWEEN '22:00' AND '23:59'
    OR j.hora_apresentacao BETWEEN '00:00' AND '05:59'
    OR j.hora_ultimo_pouso BETWEEN '22:00' AND '23:59'
    OR j.hora_ultimo_pouso BETWEEN '00:00' AND '05:59'
  );

SELECT 'CENARIO_3_REPOUSO_RUIM' AS teste,
  ROUND(AVG(fj.fator_repouso_pct * 100), 1) AS penalidade_repouso_pct,
  COUNT(*) AS amostras
FROM frms_fatorizacao_jornada fj
WHERE fj.deleted_at IS NULL
  AND fj.fator_repouso_pct < 0;

SELECT 'CENARIO_4_CICLO_AVANCADO' AS teste,
  ROUND(AVG(fj.fator_ciclo_embarcado_pct * 100), 1) AS penalidade_ciclo_pct,
  ROUND(AVG(fj.dia_periodo_embarcado), 1) AS dia_medio_ciclo,
  COUNT(*) AS amostras
FROM frms_fatorizacao_jornada fj
WHERE fj.deleted_at IS NULL
  AND fj.dia_periodo_embarcado >= 10;

SELECT 'VALIDACAO_FINAL' AS status,
  COUNT(*) AS total_jornadas,
  COUNT(CASE WHEN fj.effectiveness_pct = 100 THEN 1 END) AS ainda_100,
  ROUND(AVG(fj.effectiveness_pct), 1) AS media_geral_pct,
  MIN(fj.effectiveness_pct) AS pior_caso_pct,
  MAX(fj.effectiveness_pct) AS melhor_caso_pct,
  COUNT(CASE WHEN fj.effectiveness_nivel = 'verde' THEN 1 END) AS verde,
  COUNT(CASE WHEN fj.effectiveness_nivel = 'atencao' THEN 1 END) AS atencao,
  COUNT(CASE WHEN fj.effectiveness_nivel = 'amarelo' THEN 1 END) AS amarelo,
  COUNT(CASE WHEN fj.effectiveness_nivel = 'vermelho' THEN 1 END) AS vermelho,
  COUNT(CASE WHEN fj.processado_com_bug = 1 THEN 1 END) AS ainda_marcados_bug
FROM frms_fatorizacao_jornada fj
WHERE fj.deleted_at IS NULL;