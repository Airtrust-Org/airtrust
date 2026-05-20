-- Buscar EdApp User IDs nos eventos existentes
-- Para Antonio Ramos e Vitor Costa

SELECT DISTINCT
  edapp_user_id,
  JSON_EXTRACT(payload_json, '$.data.userId') as user_id_from_payload,
  JSON_EXTRACT(payload_json, '$.user.email') as email_from_payload,
  COUNT(*) as total_eventos,
  MIN(created_at) as primeiro_evento,
  MAX(created_at) as ultimo_evento
FROM integracoes_edapp_eventos
WHERE edapp_user_id IS NOT NULL
  AND (
    JSON_EXTRACT(payload_json, '$.user.email') LIKE '%antonio.ramos%'
    OR JSON_EXTRACT(payload_json, '$.user.email') LIKE '%vitor.costa%'
    OR edapp_user_id IN (
      SELECT DISTINCT JSON_EXTRACT(payload_json, '$.data.userId')
      FROM integracoes_edapp_eventos
      WHERE JSON_EXTRACT(payload_json, '$.user.email') LIKE '%antonio.ramos%'
         OR JSON_EXTRACT(payload_json, '$.user.email') LIKE '%vitor.costa%'
    )
  )
GROUP BY edapp_user_id
ORDER BY ultimo_evento DESC;
