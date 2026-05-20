#!/bin/bash

echo "🔍 Procurando empresa 'Costa do Sol'..."
curl -s "https://airtrust-api-production.airtrust.workers.dev/api/certificados/debug/empresa/Costa%20do%20Sol" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJhZG1pbkBhaXJ0cnVzdC5jb20uYnIiLCJyb2xlIjoiYWRtaW4ifQ.test" | jq .
