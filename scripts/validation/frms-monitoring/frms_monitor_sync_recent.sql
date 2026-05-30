-- READ ONLY MONITORING QUERY.
-- DO NOT ADD UPDATE/INSERT/DELETE.

-- Relação técnica check-in -> evento de sync -> jornada -> fatorização (últimos 7 dias).
WITH checkins_recent AS (
  SELECT id, empresa_id, funcionario_id, data_checkin, created_at
  FROM frms_fadiga_checkin
  WHERE deleted_at IS NULL
    AND date(data_checkin) >= date('now', '-7 day')
)
SELECT
  c.data_checkin,
  COUNT(DISTINCT c.id) AS checkins,
  SUM(CASE WHEN e.tipo = 'FRMS_SYNC' THEN 1 ELSE 0 END) AS eventos_sync,
  SUM(CASE WHEN e.tipo = 'FRMS_SYNC_SEM_FATORIZACAO' THEN 1 ELSE 0 END) AS eventos_sem_fatorizacao,
  SUM(CASE WHEN e.tipo = 'CHECKIN_SEM_JORNADA' THEN 1 ELSE 0 END) AS eventos_sem_jornada
FROM checkins_recent c
LEFT JOIN frms_fadiga_evento e
  ON e.checkin_id = c.id
 AND e.empresa_id = c.empresa_id
GROUP BY c.data_checkin
ORDER BY c.data_checkin DESC;

-- Jornadas sem fatorização entre registros recentes.
WITH jornadas_recent AS (
  SELECT j.id, j.empresa_id, j.tripulante_id, j.data
  FROM frms_jornada j
  WHERE j.deleted_at IS NULL
    AND date(j.data) >= date('now', '-7 day')
)
SELECT
  jr.data,
  COUNT(*) AS jornadas_total,
  SUM(CASE WHEN fj.id IS NULL THEN 1 ELSE 0 END) AS jornadas_sem_fatorizacao,
  SUM(CASE WHEN fj.id IS NOT NULL THEN 1 ELSE 0 END) AS jornadas_com_fatorizacao
FROM jornadas_recent jr
LEFT JOIN frms_fatorizacao_jornada fj
  ON fj.jornada_id = jr.id
 AND fj.deleted_at IS NULL
GROUP BY jr.data
ORDER BY jr.data DESC;
