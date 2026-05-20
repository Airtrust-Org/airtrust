#!/usr/bin/env python3
import urllib.request
import urllib.error
import json

BASE = "https://airtrust-api-production.airtrust.workers.dev/api"

endpoints = [
    "/aeronaves",
    "/simuladores",
    "/simuladores/tipos-sessao",
    "/simuladores/instrutores",
    "/funcionarios",
    "/simuladores/modelos-sessao?tipo_sessao_id=1&modelo_aeronave=SK76",
]

for ep in endpoints:
    try:
        req = urllib.request.Request(BASE + ep)
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        count = len(data.get("data", []))
        print(f"✅ {ep}: success, {count} items")
    except urllib.error.HTTPError as e:
        body = json.loads(e.read())
        print(f"❌ {ep}: {e.code} - {body.get('error', '?')}")
    except Exception as ex:
        print(f"⚠️  {ep}: {ex}")
