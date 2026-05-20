#!/usr/bin/env python3
"""
Script para inserir dados de teste no módulo FRMS via API de produção.
Simula 3 tripulantes em rotação 15x15 offshore.
"""
import json, subprocess, datetime, time, random

API = "https://airtrust-api-production.airtrust.workers.dev"

def curl_post(path, body, token=None):
    headers = ["-H", "Content-Type: application/json"]
    if token:
        headers += ["-H", f"Authorization: Bearer {token}"]
    result = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}{path}"] + headers +
        ["-d", json.dumps(body)],
        capture_output=True, text=True, timeout=20
    )
    try:
        return json.loads(result.stdout)
    except Exception:
        return {"success": False, "error": result.stdout[:200]}

# 1) Login
resp = curl_post("/api/auth/login", {"email": "admin@airtrust.com", "password": "Admin@123"})
TOKEN = resp["data"]["accessToken"]
print(f"✅ Login OK — token {TOKEN[:30]}...")

def post(path, body):
    return curl_post(path, body, token=TOKEN)

def date_str(offset_days):
    """Retorna data de hoje - offset_days no formato YYYY-MM-DD"""
    d = datetime.date.today() - datetime.timedelta(days=offset_days)
    return d.strftime("%Y-%m-%d")

# ─── Tripulantes ───────────────────────────────────────────────────────────────
# ID 3 = Antonio Luiz Simões Ramos   → 15 dias embarcado, alto volume HV
# ID 4 = Bernardo Freire Antunes     → 15 dias embarcado, médio HV
# ID 5 = Caio Cesar Simões           → misto: 10 ES + 5 FR, baixo HV
# ──────────────────────────────────────────────────────────────────────────────

jornadas = []

# === Antonio (3) - 15 dias ES com alto HV (rota offshore intensa) ===
for i in range(15, 0, -1):  # dia 15 a dia 1 atrás
    hv = random.randint(180, 360)   # 3h–6h de voo por dia
    hora_ap = f"0{random.randint(5,7)}:00" if random.random() > 0.5 else "06:30"
    jornadas.append({
        "tripulante_id": 3,
        "data": date_str(i),
        "status": "ES",
        "hora_apresentacao": hora_ap,
        "hora_termino": "17:30",
        "horas_voo_minutos": hv,
        "observacao": "Seed de teste",
    })

# === Bernardo (4) - 12 ES + 3 FR ===
for i in range(15, 3, -1):  # dia 15 a dia 4 atrás → 12 dias ES
    hv = random.randint(120, 240)
    jornadas.append({
        "tripulante_id": 4,
        "data": date_str(i),
        "status": "ES",
        "hora_apresentacao": "07:00",
        "hora_termino": "16:00",
        "horas_voo_minutos": hv,
        "observacao": "Seed de teste",
    })
for i in range(3, 0, -1):  # últimos 3 dias — folga
    jornadas.append({
        "tripulante_id": 4,
        "data": date_str(i),
        "status": "FR",
        "observacao": "Folga pós-embarque",
    })

# === Caio (5) - 7 ES + 4 Férias + 4 FR ===
for i in range(15, 8, -1):  # dia 15 a dia 9 = 7 dias ES
    hv = random.randint(90, 180)
    jornadas.append({
        "tripulante_id": 5,
        "data": date_str(i),
        "status": "ES",
        "hora_apresentacao": "08:00",
        "hora_termino": "15:00",
        "horas_voo_minutos": hv,
        "observacao": "Seed de teste",
    })
for i in range(8, 4, -1):  # dia 8 a dia 5 = 4 dias férias
    jornadas.append({
        "tripulante_id": 5,
        "data": date_str(i),
        "status": "FE",
        "observacao": "Férias regulares",
    })
for i in range(4, 0, -1):  # dia 4 a dia 1
    jornadas.append({
        "tripulante_id": 5,
        "data": date_str(i),
        "status": "FR",
        "observacao": "Folga",
    })

# ─── Inserir ───────────────────────────────────────────────────────────────────
print(f"\n📋 Total de jornadas a inserir: {len(jornadas)}")
ok = 0
erros = 0

for j in jornadas:
    tid = j["tripulante_id"]
    result = post("/api/frms/jornadas", j)
    if result.get("success") is not False:
        ok += 1
        alertas = (result.get("data") or {}).get("alertas") or []
        bloq = (result.get("data") or {}).get("bloqueado", False)
        marcador = "🔴 BLOQUEADO" if bloq else (f"⚠️  {len(alertas)} alerta(s)" if alertas else "✅")
        print(f"  {marcador} Tripulante {tid} | {j['data']} | {j['status']}")
    else:
        erros += 1
        print(f"  ❌ Tripulante {tid} | {j['data']} — {result.get('error','?')[:80]}")
    time.sleep(0.15)  # evitar rate-limit

print(f"\n🎉 Concluído: {ok} inseridas, {erros} erros")
