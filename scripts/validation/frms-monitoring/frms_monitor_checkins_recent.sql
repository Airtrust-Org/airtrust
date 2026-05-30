-- READ ONLY MONITORING QUERY.
-- DO NOT ADD UPDATE/INSERT/DELETE.

-- Check-ins dos últimos 7 dias (sem nomes), com contagem por dia e status.
SELECT
  data_checkin,
  COALESCE(status_operacional, 'SEM_STATUS') AS status_operacional,
  COUNT(*) AS total
FROM frms_fadiga_checkin
WHERE deleted_at IS NULL
  AND date(data_checkin) >= date('now', '-7 day')
GROUP BY data_checkin, COALESCE(status_operacional, 'SEM_STATUS')
ORDER BY data_checkin DESC, status_operacional;

-- Volume diário bruto de check-ins.
SELECT
  data_checkin,
  COUNT(*) AS total_checkins_dia
FROM frms_fadiga_checkin
WHERE deleted_at IS NULL
  AND date(data_checkin) >= date('now', '-7 day')
GROUP BY data_checkin
ORDER BY data_checkin DESC;
