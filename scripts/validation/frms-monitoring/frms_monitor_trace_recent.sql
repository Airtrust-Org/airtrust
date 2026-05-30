-- READ ONLY MONITORING QUERY.
-- DO NOT ADD UPDATE/INSERT/DELETE.

-- Cobertura técnica mínima de dados para explicação do dia (últimos 7 dias).
SELECT
  j.data,
  COUNT(*) AS total_jornadas,
  SUM(CASE WHEN fj.effectiveness_pct IS NOT NULL THEN 1 ELSE 0 END) AS com_effectiveness,
  SUM(CASE WHEN fj.effectiveness_componentes_json IS NOT NULL AND TRIM(fj.effectiveness_componentes_json) <> '' THEN 1 ELSE 0 END) AS com_componentes_json,
  SUM(CASE WHEN fj.hora_despertar_estimada IS NOT NULL THEN 1 ELSE 0 END) AS com_hora_despertar,
  SUM(CASE WHEN fj.duracao_sono_efetiva_min IS NOT NULL THEN 1 ELSE 0 END) AS com_sono_efetivo,
  SUM(CASE WHEN COALESCE(fj.processado_com_bug, 0) = 0 THEN 1 ELSE 0 END) AS c2_corrigido,
  SUM(CASE WHEN COALESCE(fj.processado_com_bug, 0) = 1 THEN 1 ELSE 0 END) AS legado_flag
FROM frms_jornada j
JOIN frms_fatorizacao_jornada fj
  ON fj.jornada_id = j.id
 AND fj.deleted_at IS NULL
WHERE j.deleted_at IS NULL
  AND date(j.data) >= date('now', '-7 day')
GROUP BY j.data
ORDER BY j.data DESC;

-- Eventos de sync recentes que ajudam no rastreio de explicação.
SELECT
  date(created_at) AS dia,
  tipo,
  COUNT(*) AS total
FROM frms_fadiga_evento
WHERE tipo IN ('FRMS_SYNC', 'FRMS_RECALCULO_NECESSARIO', 'FRMS_SYNC_SEM_FATORIZACAO', 'CHECKIN_SEM_JORNADA')
  AND date(created_at) >= date('now', '-7 day')
GROUP BY date(created_at), tipo
ORDER BY dia DESC, tipo;
