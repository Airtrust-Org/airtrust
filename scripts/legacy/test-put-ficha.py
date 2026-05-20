#!/usr/bin/env python3
import json
import time
import base64
import hashlib
import hmac
import urllib.request
import urllib.error
import urllib.parse

# 1. Login first
login_data = json.dumps({"email": "admin@airtrust.com", "senha": "Admin@123"}).encode()
req = urllib.request.Request(
    "https://airtrust-api-production.airtrust.workers.dev/api/auth/login",
    data=login_data,
    headers={"Content-Type": "application/json"},
    method="POST"
)
try:
    resp = urllib.request.urlopen(req, timeout=15)
    data = json.loads(resp.read())
    token = data.get("data", {}).get("accessToken", "")
    print(f"Login: success={data.get('success')}")
    print(f"Token prefix: {token[:50]}")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    print(f"Login failed: {body}")
    token = ""
    exit(1)

if not token:
    print("No token obtained")
    exit(1)

# 2. Test PUT /api/simuladores/fichas/59
put_data = json.dumps({
    "recalculate_status": True,
    "observacoes": "Teste de salvamento",
    "manobras": [
        {"ordem": 1, "resultado": 8, "observacoes": "boa execução"},
        {"ordem": 2, "resultado": 7, "observacoes": ""},
        {"ordem": 3, "resultado": None, "observacoes": ""},
    ]
}).encode()

req2 = urllib.request.Request(
    "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/fichas/59",
    data=put_data,
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    },
    method="PUT"
)
try:
    resp2 = urllib.request.urlopen(req2, timeout=15)
    data2 = json.loads(resp2.read())
    print(f"PUT fichas/59: success={data2.get('success')}")
    print(f"Status: {data2.get('data', {}).get('status')}")
except urllib.error.HTTPError as e:
    body = json.loads(e.read())
    print(f"PUT failed ({e.code}): {body}")
except Exception as e:
    print(f"Error: {e}")
