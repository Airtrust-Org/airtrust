#!/bin/bash
response=$(curl -s -w "\n%{http_code}" -X POST \
  "https://airtrust-api-production.airtrust.workers.dev/api/alertas/ead-vencido/3870" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-bypass" \
  -d '{"enviarEmail":true,"enviarWhatsApp":true}')

http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n-1)

echo "HTTP Code: $http_code"
echo "Response: $body"
