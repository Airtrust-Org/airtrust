-- READ ONLY MONITORING QUERY.
-- DO NOT ADD UPDATE/INSERT/DELETE.

-- Verificação de efeitos colaterais fora do escopo FRMS monitorado.
-- A consulta usa filtro textual em tipo/mensagem para detectar possíveis disparos indevidos.

SELECT
  date(created_at) AS dia,
  COUNT(*) AS total_eventos_frms
FROM frms_fadiga_evento
WHERE date(created_at) >= date('now', '-7 day')
GROUP BY date(created_at)
ORDER BY dia DESC;

SELECT
  date(created_at) AS dia,
  tipo,
  COUNT(*) AS total
FROM frms_fadiga_evento
WHERE date(created_at) >= date('now', '-7 day')
  AND (
    UPPER(COALESCE(tipo, '')) LIKE '%SGSO%'
    OR UPPER(COALESCE(tipo, '')) LIKE '%ACK%'
    OR UPPER(COALESCE(tipo, '')) LIKE '%NOTIFIC%'
    OR UPPER(COALESCE(tipo, '')) LIKE '%ALERTA%'
  )
GROUP BY date(created_at), tipo
ORDER BY dia DESC, tipo;
