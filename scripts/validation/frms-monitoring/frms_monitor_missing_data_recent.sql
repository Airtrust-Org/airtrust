-- READ ONLY MONITORING QUERY.
-- DO NOT ADD UPDATE/INSERT/DELETE.

-- Sinais de dados ausentes/estimados/pendentes nos últimos 7 dias.
SELECT
  j.data,
  COUNT(*) AS total_jornadas,
  SUM(CASE WHEN j.hora_apresentacao IS NULL OR TRIM(j.hora_apresentacao) = '' THEN 1 ELSE 0 END) AS sem_hora_apresentacao,
  SUM(CASE WHEN fj.duracao_sono_efetiva_min IS NULL THEN 1 ELSE 0 END) AS sem_sono_efetivo,
  SUM(CASE WHEN UPPER(COALESCE(j.fonte_sono, 'PADRAO')) = 'PADRAO' THEN 1 ELSE 0 END) AS sono_estimado,
  SUM(CASE WHEN UPPER(COALESCE(j.fonte_sono, 'PADRAO')) <> 'PADRAO' THEN 1 ELSE 0 END) AS sono_informado,
  SUM(CASE WHEN e.tipo = 'FRMS_RECALCULO_NECESSARIO' THEN 1 ELSE 0 END) AS recalc_pendente_evento
FROM frms_jornada j
LEFT JOIN frms_fatorizacao_jornada fj
  ON fj.jornada_id = j.id
 AND fj.deleted_at IS NULL
LEFT JOIN frms_fadiga_evento e
  ON e.empresa_id = j.empresa_id
 AND e.tipo = 'FRMS_RECALCULO_NECESSARIO'
 AND date(e.created_at) = date(j.data)
WHERE j.deleted_at IS NULL
  AND date(j.data) >= date('now', '-7 day')
GROUP BY j.data
ORDER BY j.data DESC;
