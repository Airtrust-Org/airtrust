#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://airtrust-api-production.airtrust.workers.dev}"
EMAIL="${AIRTRUST_SMOKE_EMAIL:-}"
PASSWORD="${AIRTRUST_SMOKE_PASSWORD:-}"
ANO="${AIRTRUST_SMOKE_ANO:-2026}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "❌ Defina AIRTRUST_SMOKE_EMAIL e AIRTRUST_SMOKE_PASSWORD"
  exit 1
fi

json_get() {
  python3 -c 'import json, sys
path = sys.argv[1].split(".")
data = json.load(sys.stdin)
cur = data
for part in path:
    if part.isdigit():
        cur = cur[int(part)]
    else:
        cur = cur.get(part)
print("" if cur is None else cur)
' "$1"
}

echo "=== SMOKE TEST ESCALAS ==="

echo "1) Login"
LOGIN=$(curl -sf -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | json_get data.accessToken)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Não foi possível obter token"
  exit 1
fi
echo "✓ Login OK"

echo "2) Health da API"
HEALTH=$(curl -sf "$BASE/api/health" -H "Authorization: Bearer $TOKEN")
STATUS=$(printf '%s' "$HEALTH" | json_get status)
if [[ "$STATUS" != "healthy" ]]; then
  echo "❌ Health API degradado: $HEALTH"
  exit 1
fi
echo "✓ Health OK"

echo "3) Escala alvo"
ESCALAS=$(curl -sf "$BASE/api/escalas?ano=$ANO" -H "Authorization: Bearer $TOKEN")
read -r ESCALA_ID ESCALA_MES ESCALA_ANO <<<"$(printf '%s' "$ESCALAS" | python3 -c 'import json, sys
rows = (json.load(sys.stdin).get("data") or [])
target = None
for row in rows:
  if row.get("status") != "publicada":
    target = row
    break
if not target and rows:
  target = rows[0]
if not target:
  raise SystemExit(1)
print(target["id"], target["mes"], target["ano"])
')"
echo "✓ Escala alvo: $ESCALA_ID ($ESCALA_MES/$ESCALA_ANO)"

read -r DATA_INICIO DATA_FIM <<<"$(python3 - <<PY
from calendar import monthrange
year = int(${ESCALA_ANO})
month = int(${ESCALA_MES})
last_day = monthrange(year, month)[1]
mid = min(15, last_day)
print(f"{year:04d}-{month:02d}-01 {year:04d}-{month:02d}-{mid:02d}")
PY
)"

DATA_INICIO="${AIRTRUST_SMOKE_DATA_INICIO:-$DATA_INICIO}"
DATA_FIM="${AIRTRUST_SMOKE_DATA_FIM:-$DATA_FIM}"

echo "4) Aeronaves"
AERONAVES=$(curl -sf "$BASE/api/aeronaves" -H "Authorization: Bearer $TOKEN")
read -r AERONAVE_ID AERONAVE_DESC <<<"$(printf '%s' "$AERONAVES" | python3 -c 'import json, sys
payload = json.load(sys.stdin)
rows = payload.get("data") if isinstance(payload, dict) else payload
if not rows:
  raise SystemExit(1)
prefer = next((r for r in rows if str(r.get("modelo") or "").upper() == "SK76"), rows[0])
row = prefer
prefixo = (row.get("prefixo") or "").strip()
modelo = (row.get("modelo") or "").strip()
desc = f"{prefixo} {modelo}".strip()
print(row["id"], desc)
')"
echo "✓ Aeronave: $AERONAVE_DESC"

read -r AW139_ID SK76_ID <<<"$(printf '%s' "$AERONAVES" | python3 -c 'import json, sys
payload = json.load(sys.stdin)
rows = payload.get("data") if isinstance(payload, dict) else payload
aw = next((str(r.get("id")) for r in rows if str(r.get("modelo") or "").upper() == "AW139"), "")
sk = next((str(r.get("id")) for r in rows if str(r.get("modelo") or "").upper() == "SK76"), "")
print(aw, sk)
')"

TRIPULACOES_ATUAIS=$(curl -sf "$BASE/api/escalas/$ESCALA_ID/tripulacoes" -H "Authorization: Bearer $TOKEN")
read -r AERONAVE_ALOC_ID AERONAVE_ALOC_DESC <<<"$(python3 - <<'PY' "$AERONAVES" "$TRIPULACOES_ATUAIS"
import json, sys

def norm(value: str) -> str:
    return ' '.join((value or '').strip().upper().split())

aeronaves_payload = json.loads(sys.argv[1])
tripulacoes_payload = json.loads(sys.argv[2])
aeronaves = aeronaves_payload.get('data') if isinstance(aeronaves_payload, dict) else aeronaves_payload
tripulacoes = tripulacoes_payload.get('data') or []
ocupadas = {norm(row.get('aeronave') or '') for row in tripulacoes if row.get('deleted_at') is None}

for row in aeronaves or []:
    prefixo = (row.get('prefixo') or '').strip()
    modelo = (row.get('modelo') or '').strip()
    desc = f"{prefixo} {modelo}".strip()
    if desc and norm(desc) not in ocupadas:
        print(row['id'], desc)
        raise SystemExit(0)

raise SystemExit(1)
PY
)"

if [[ -z "${AERONAVE_ALOC_ID:-}" || -z "${AERONAVE_ALOC_DESC:-}" ]]; then
  echo "❌ Nenhuma aeronave livre encontrada para validar criação de tripulação"
  exit 1
fi
echo "✓ Aeronave livre para criação: $AERONAVE_ALOC_DESC"

echo "5) Tripulantes operacionais filtrados"
PILOTOS=$(curl -sf "$BASE/api/escalas/tripulantes-operacionais?aeronave_id=$AERONAVE_ID&escala_id=$ESCALA_ID&incluir_bloqueados=true" -H "Authorization: Bearer $TOKEN")
read -r TOTAL_PILOTOS PILOT_IDS <<<"$(printf '%s' "$PILOTOS" | python3 -c 'import json, sys
payload = json.load(sys.stdin).get("data") or {}
rows = payload.get("tripulantes") or []
if not rows:
  raise SystemExit(1)
def role_weight(row):
  role = str(row.get("role") or "").upper()
  return 0 if ("PIC" in role or "COMANDANTE" in role) else 1
ordered = sorted(rows, key=lambda r: (role_weight(r), str(r.get("funcionario_id"))))
print(len(rows), " ".join(str(row["funcionario_id"]) for row in ordered if row.get("pode_ser_alocado") is not False))
')"
echo "✓ Pilotos filtrados: $TOTAL_PILOTOS"

if [[ -n "$AW139_ID" && -n "$SK76_ID" ]]; then
  echo "5b) Listas AW139 x SK76"
  PILOTOS_AW139=$(curl -sf "$BASE/api/escalas/tripulantes-operacionais?aeronave_id=$AW139_ID&escala_id=$ESCALA_ID&incluir_bloqueados=true" -H "Authorization: Bearer $TOKEN")
  PILOTOS_SK76=$(curl -sf "$BASE/api/escalas/tripulantes-operacionais?aeronave_id=$SK76_ID&escala_id=$ESCALA_ID&incluir_bloqueados=true" -H "Authorization: Bearer $TOKEN")
  AW139_TOTAL=$(printf '%s' "$PILOTOS_AW139" | python3 -c 'import json, sys; payload=json.load(sys.stdin).get("data") or {}; rows=payload.get("tripulantes") or []; print(len(rows))')
  SK76_TOTAL=$(printf '%s' "$PILOTOS_SK76" | python3 -c 'import json, sys; payload=json.load(sys.stdin).get("data") or {}; rows=payload.get("tripulantes") or []; print(len(rows))')
  AW139_IDS=$(printf '%s' "$PILOTOS_AW139" | python3 -c 'import json, sys; payload=json.load(sys.stdin).get("data") or {}; rows=payload.get("tripulantes") or []; print(" ".join(sorted(str(r.get("funcionario_id")) for r in rows)))')
  SK76_IDS=$(printf '%s' "$PILOTOS_SK76" | python3 -c 'import json, sys; payload=json.load(sys.stdin).get("data") or {}; rows=payload.get("tripulantes") or []; print(" ".join(sorted(str(r.get("funcionario_id")) for r in rows)))')
  echo "   AW139: $AW139_TOTAL"
  echo "   SK76:  $SK76_TOTAL"
  if [[ "$AW139_IDS" == "$SK76_IDS" ]]; then
    echo "❌ Filtro por modelo retornou a mesma lista para AW139 e SK76"
    exit 1
  fi
  echo "✓ Listas por modelo são diferentes"
fi

echo "6) Padrões dinâmicos disponíveis"
PADROES=$(curl -sf "$BASE/api/escalas/padroes" -H "Authorization: Bearer $TOKEN")
TOTAL_PADROES=$(printf '%s' "$PADROES" | python3 -c 'import json, sys
rows = json.load(sys.stdin).get("data") or []
print(len(rows))
')
if [[ "${TOTAL_PADROES:-0}" -le 0 ]]; then
  echo "❌ Nenhum padrão dinâmico retornado pela API"
  exit 1
fi
echo "✓ Padrões dinâmicos: $TOTAL_PADROES"

echo "7) Endpoint operacional real"
OPERACIONAIS="$PILOTOS"
TOTAL_OPERACIONAIS=$(printf '%s' "$OPERACIONAIS" | python3 -c 'import json, sys
payload = json.load(sys.stdin).get("data") or {}
rows = payload.get("tripulantes") or []
print(len(rows))
')
if [[ -z "$TOTAL_OPERACIONAIS" ]]; then
  echo "❌ Endpoint operacional retornou payload inválido"
  exit 1
fi
echo "✓ Tripulantes operacionais: $TOTAL_OPERACIONAIS"

echo "8) Preferências persistidas"
PREFERENCIAS=$(curl -sf "$BASE/api/escalas/preferencias" -H "Authorization: Bearer $TOKEN")
EXIBIR_NOME=$(printf '%s' "$PREFERENCIAS" | json_get data.exibir_nome)
if [[ "$EXIBIR_NOME" != "completo" && "$EXIBIR_NOME" != "guerra" ]]; then
  echo "❌ Preferências inválidas: $PREFERENCIAS"
  exit 1
fi
PREF_STATUS=$(curl -sS -o /tmp/airtrust-escalas-pref-body.json -w '%{http_code}' -X PUT "$BASE/api/escalas/preferencias/exibir-nome" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"valor\":\"$EXIBIR_NOME\"}")
if [[ "$PREF_STATUS" != "200" ]]; then
  echo "❌ PUT preferencias falhou: status=$PREF_STATUS body=$(cat /tmp/airtrust-escalas-pref-body.json)"
  exit 1
fi
echo "✓ Preferências OK ($EXIBIR_NOME)"

echo "9) Tipos de evento persistidos"
TIPOS=$(curl -sf "$BASE/api/escalas/tipos-evento-config" -H "Authorization: Bearer $TOKEN")
TIPO_ID=$(printf '%s' "$TIPOS" | json_get data.0.id)
TIPO_LABEL=$(printf '%s' "$TIPOS" | json_get data.0.label)
TIPO_COR=$(printf '%s' "$TIPOS" | json_get data.0.cor)
TIPO_ICONE=$(printf '%s' "$TIPOS" | json_get data.0.icone)
TIPO_ATIVO=$(printf '%s' "$TIPOS" | json_get data.0.ativo)
TIPO_ORDEM=$(printf '%s' "$TIPOS" | json_get data.0.ordem)
if [[ -z "$TIPO_ID" ]]; then
  echo "❌ Nenhum tipo de evento retornado pela API"
  exit 1
fi
TIPO_STATUS=$(curl -sS -o /tmp/airtrust-escalas-tipo-body.json -w '%{http_code}' -X PUT "$BASE/api/escalas/tipos-evento-config/$TIPO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"label\":\"$TIPO_LABEL\",\"cor\":\"$TIPO_COR\",\"icone\":\"$TIPO_ICONE\",\"ativo\":$TIPO_ATIVO,\"ordem\":$TIPO_ORDEM}")
if [[ "$TIPO_STATUS" != "200" ]]; then
  echo "❌ PUT tipos-evento-config falhou: status=$TIPO_STATUS body=$(cat /tmp/airtrust-escalas-tipo-body.json)"
  exit 1
fi
echo "✓ Tipos de evento OK"

echo "9b) Tripulantes para aeronave livre"
PILOTOS_ALOCACAO=$(curl -sf "$BASE/api/escalas/tripulantes-operacionais?aeronave_id=$AERONAVE_ALOC_ID&escala_id=$ESCALA_ID&incluir_bloqueados=true" -H "Authorization: Bearer $TOKEN")
PILOT_IDS_ALOCACAO=$(printf '%s' "$PILOTOS_ALOCACAO" | python3 -c 'import json, sys
payload = json.load(sys.stdin).get("data") or {}
rows = payload.get("tripulantes") or []
if not rows:
  raise SystemExit(1)
def role_weight(row):
  role = str(row.get("role") or "").upper()
  return 0 if ("PIC" in role or "COMANDANTE" in role) else 1
ordered = sorted(rows, key=lambda r: (role_weight(r), str(r.get("funcionario_id"))))
print(" ".join(str(row["funcionario_id"]) for row in ordered if row.get("pode_ser_alocado") is not False))
')
if [[ -z "${PILOT_IDS_ALOCACAO:-}" ]]; then
  echo "❌ Nenhum tripulante apto encontrado para a aeronave livre: $AERONAVE_ALOC_DESC"
  exit 1
fi
echo "✓ Tripulantes aptos encontrados para criação"

echo "10) Criar tripulação teste"
TRIP_ID=''
LAST_ERROR=''
EVENTOS_GERADOS='0'

for PIC_ID in $PILOT_IDS_ALOCACAO; do
  BODY=$(printf '{"pic_id":"%s","data_inicio":"%s","data_fim":"%s","aeronave":"%s"}' \
    "$PIC_ID" "$DATA_INICIO" "$DATA_FIM" "$AERONAVE_ALOC_DESC")

  HTTP_STATUS=$(curl -sS -o /tmp/airtrust-escalas-smoke-body.json -w '%{http_code}' -X POST "$BASE/api/escalas/$ESCALA_ID/tripulacoes" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$BODY")
  RESULT=$(cat /tmp/airtrust-escalas-smoke-body.json)

  if [[ "$HTTP_STATUS" == "201" ]]; then
    TRIP_ID=$(printf '%s' "$RESULT" | json_get data.id)
    EVENTOS_GERADOS=$(printf '%s' "$RESULT" | json_get data.eventos_gerados)
    break
  fi

  LAST_ERROR="PIC=$PIC_ID status=$HTTP_STATUS body=$RESULT"
done

if [[ -z "$TRIP_ID" ]]; then
  echo "❌ Falha ao criar tripulação: $LAST_ERROR"
  exit 1
fi

echo "✓ Tripulação criada: $TRIP_ID"
if [[ "${EVENTOS_GERADOS:-0}" -le 0 ]]; then
  echo "❌ Tripulação criada sem eventos_gerados síncronos: $RESULT"
  exit 1
fi
echo "✓ Eventos gerados síncronos: $EVENTOS_GERADOS"

echo "11) Tripulação aparece imediatamente após POST"
TRIPULACOES=$(curl -sf "$BASE/api/escalas/$ESCALA_ID/tripulacoes" -H "Authorization: Bearer $TOKEN")
EXISTE_TRIP=$(printf '%s' "$TRIPULACOES" | python3 -c 'import json, sys
rows = json.load(sys.stdin).get("data") or []
ids = {str(row.get("id")) for row in rows}
print("SIM" if sys.argv[1] in ids else "NAO")
' "$TRIP_ID")
if [[ "$EXISTE_TRIP" != "SIM" ]]; then
  echo "❌ Tripulação não listada imediatamente após POST"
  exit 1
fi
echo "✓ Tripulação listada imediatamente"

echo "12) Validar auto_quinzena com VOO e FOL"
CAL=$(curl -sf "$BASE/api/escalas/$ESCALA_ID/calendario" -H "Authorization: Bearer $TOKEN")
read -r AUTO_COUNT AUTO_VOO AUTO_FOL <<<"$(printf '%s' "$CAL" | python3 -c 'import json, sys
rows = (json.load(sys.stdin).get("data") or {}).get("eventos") or []
auto = [row for row in rows if row.get("tripulacao_id") == sys.argv[1] and row.get("origem") == "auto_quinzena"]
voo = sum(1 for row in auto if row.get("tipo_evento") == "voo")
fol = sum(1 for row in auto if row.get("tipo_evento") == "folga")
print(len(auto), voo, fol)
' "$TRIP_ID")"
if [[ "${AUTO_COUNT:-0}" -le 0 ]]; then
  echo "❌ Nenhum evento auto_quinzena encontrado"
  exit 1
fi
if [[ "${AUTO_VOO:-0}" -le 0 || "${AUTO_FOL:-0}" -le 0 ]]; then
  echo "❌ Eventos automáticos sem VOO/FOL completos: total=$AUTO_COUNT voo=$AUTO_VOO fol=$AUTO_FOL"
  exit 1
fi
echo "✓ Eventos auto_quinzena presentes: total=$AUTO_COUNT voo=$AUTO_VOO fol=$AUTO_FOL"

echo "13) Regenerar eventos da tripulação"
REGEN_STATUS=$(curl -sS -o /tmp/airtrust-escalas-regen-body.json -w '%{http_code}' -X POST "$BASE/api/escalas/$ESCALA_ID/tripulacoes/$TRIP_ID/regenerar-eventos" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json')
REGEN_BODY=$(cat /tmp/airtrust-escalas-regen-body.json)
if [[ "$REGEN_STATUS" != "200" ]]; then
  echo "❌ Endpoint regenerar-eventos falhou: status=$REGEN_STATUS body=$REGEN_BODY"
  exit 1
fi
REGEN_COUNT=$(printf '%s' "$REGEN_BODY" | json_get data.eventos_gerados)
echo "✓ Regenerar-eventos OK: ${REGEN_COUNT:-0} eventos"

echo "14) Regenerar mantém VOO e FOL"
CAL_REGEN=$(curl -sf "$BASE/api/escalas/$ESCALA_ID/calendario" -H "Authorization: Bearer $TOKEN")
read -r REGEN_VOO REGEN_FOL <<<"$(printf '%s' "$CAL_REGEN" | python3 -c 'import json, sys
rows = (json.load(sys.stdin).get("data") or {}).get("eventos") or []
auto = [row for row in rows if row.get("tripulacao_id") == sys.argv[1] and row.get("origem") == "auto_quinzena"]
print(sum(1 for row in auto if row.get("tipo_evento") == "voo"), sum(1 for row in auto if row.get("tipo_evento") == "folga"))
' "$TRIP_ID")"
if [[ "${REGEN_VOO:-0}" -le 0 || "${REGEN_FOL:-0}" -le 0 ]]; then
  echo "❌ Regeneração não preservou VOO/FOL: voo=$REGEN_VOO fol=$REGEN_FOL"
  exit 1
fi
echo "✓ Regeneração preservou VOO/FOL: voo=$REGEN_VOO fol=$REGEN_FOL"

echo "15) Endpoint admin removido"
STATUS_ADMIN=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/escalas/admin/backfill-eventos-base/teste" -H "Authorization: Bearer $TOKEN")
if [[ "$STATUS_ADMIN" != "404" ]]; then
  echo "❌ Endpoint admin ainda responde: $STATUS_ADMIN"
  exit 1
fi
echo "✓ Endpoint admin removido"

echo "16) Limpeza"
curl -sf -X DELETE "$BASE/api/escalas/$ESCALA_ID/tripulacoes/$TRIP_ID" \
  -H "Authorization: Bearer $TOKEN" >/dev/null
echo "✓ Limpeza OK"

echo "=== SMOKE TEST ESCALAS OK ==="
