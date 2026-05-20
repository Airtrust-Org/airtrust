#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://airtrust-api-production.airtrust.workers.dev}"
EMAIL="${AIRTRUST_SMOKE_EMAIL:-}"
PASSWORD="${AIRTRUST_SMOKE_PASSWORD:-}"
ANO="${AIRTRUST_SMOKE_ANO:-2026}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Defina AIRTRUST_SMOKE_EMAIL e AIRTRUST_SMOKE_PASSWORD"
  exit 1
fi

json_path() {
  python3 -c 'import json,sys; cur=json.load(sys.stdin); parts=[p for p in sys.argv[1].split(".") if p]; [cur := (cur[int(part)] if part.isdigit() else cur.get(part)) for part in parts]; print("" if cur is None else cur)' "$1"
}

echo "== Escalas v2 smoke =="

LOGIN=$(curl -sf -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | json_path data.accessToken)
if [[ -z "$TOKEN" ]]; then
  echo "Falha no login"
  exit 1
fi

AUTH=(-H "Authorization: Bearer $TOKEN")

ESCALAS=$(curl -sf "$BASE/api/escalas?ano=$ANO" "${AUTH[@]}")
read -r ESCALA_ID ESCALA_MES ESCALA_ANO <<<"$(printf '%s' "$ESCALAS" | python3 -c "import json,sys; rows=(json.load(sys.stdin).get('data') or []); target=next((row for row in rows if row.get('status') != 'publicada'), rows[0] if rows else None); (_ for _ in ()).throw(SystemExit(1)) if not target else None; print(target['id'], target['mes'], target['ano'])")"

read -r DATA_INICIO DATA_FIM <<<"$(python3 - <<PY
from calendar import monthrange
year = int(${ESCALA_ANO})
month = int(${ESCALA_MES})
last_day = monthrange(year, month)[1]
print(f"{year:04d}-{month:02d}-01 {year:04d}-{month:02d}-{min(15, last_day):02d}")
PY
)"

AERONAVES=$(curl -sf "$BASE/api/aeronaves" "${AUTH[@]}")
read -r AERONAVE_ID AERONAVE_PREFIXO <<<"$(printf '%s' "$AERONAVES" | python3 -c "import json,sys; rows=(json.load(sys.stdin).get('data') or []); target=next((row for row in rows if row.get('ativo', 1)), None); (_ for _ in ()).throw(SystemExit(1)) if not target else None; print(target['id'], target.get('prefixo') or 'SEM-PREFIXO')")"

TRIPULANTES=$(curl -sf "$BASE/api/escalas/tripulantes-operacionais?aeronave_id=$AERONAVE_ID&escala_id=$ESCALA_ID&funcao=PIC&data_inicio=$DATA_INICIO&data_fim=$DATA_FIM&incluir_bloqueados=true" "${AUTH[@]}")
FUNCIONARIO_ID=$(printf '%s' "$TRIPULANTES" | python3 -c "import json,sys; rows=((json.load(sys.stdin).get('data') or {}).get('tripulantes') or []); target=next((row for row in rows if row.get('pode_ser_alocado') is not False), None); (_ for _ in ()).throw(SystemExit(1)) if not target else None; print(target['funcionario_id'])")

BODY=$(printf '{"funcionario_id":"%s","aeronave_id":%s,"funcao":"PIC","data_inicio":"%s","data_fim":"%s"}' \
  "$FUNCIONARIO_ID" "$AERONAVE_ID" "$DATA_INICIO" "$DATA_FIM")

CREATE_STATUS=$(curl -sS -o /tmp/airtrust-escalas-v2-create.json -w '%{http_code}' \
  -X POST "$BASE/api/escalas/$ESCALA_ID/alocacoes" \
  "${AUTH[@]}" -H 'Content-Type: application/json' -d "$BODY")
if [[ "$CREATE_STATUS" != "201" ]]; then
  echo "Falha ao criar alocação v2: status=$CREATE_STATUS body=$(cat /tmp/airtrust-escalas-v2-create.json)"
  exit 1
fi

ALOCACAO_ID=$(cat /tmp/airtrust-escalas-v2-create.json | json_path data.alocacao.id)
if [[ -z "$ALOCACAO_ID" ]]; then
  echo "Resposta sem alocacao.id"
  exit 1
fi
echo "Alocação criada: $ALOCACAO_ID"

LISTA=$(curl -sf "$BASE/api/escalas/$ESCALA_ID/alocacoes?aeronave_id=$AERONAVE_ID&funcao=PIC&data=$DATA_INICIO" "${AUTH[@]}")
LISTADO=$(printf '%s' "$LISTA" | python3 -c "import json,sys; needle=sys.argv[1]; rows=((json.load(sys.stdin).get('data') or {}).get('alocacoes') or []); print('ok' if any(str(row.get('id')) == needle for row in rows) else 'no')" "$ALOCACAO_ID")
if [[ "$LISTADO" != "ok" ]]; then
  echo "Alocação não retornou na listagem"
  exit 1
fi

DUP_STATUS=$(curl -sS -o /tmp/airtrust-escalas-v2-dup.json -w '%{http_code}' \
  -X POST "$BASE/api/escalas/$ESCALA_ID/alocacoes" \
  "${AUTH[@]}" -H 'Content-Type: application/json' -d "$BODY")
if [[ "$DUP_STATUS" != "409" ]]; then
  echo "Esperava 409 por SLOT_OCUPADO, recebi $DUP_STATUS body=$(cat /tmp/airtrust-escalas-v2-dup.json)"
  exit 1
fi

curl -sf -X POST "$BASE/api/escalas/$ESCALA_ID/cobertura/recalcular?aeronave_id=$AERONAVE_ID" "${AUTH[@]}" >/dev/null
echo "Cobertura recalculada"

COBERTURA=$(curl -sf "$BASE/api/escalas/$ESCALA_ID/cobertura?aeronave_id=$AERONAVE_ID" "${AUTH[@]}")
read -r QTD_PIC STATUS_COBERTURA <<<"$(printf '%s' "$COBERTURA" | python3 -c "import json,sys; target_date=sys.argv[1]; payload=json.load(sys.stdin).get('data') or {}; aeronaves=payload.get('aeronaves') or []; (_ for _ in ()).throw(SystemExit(1)) if not aeronaves else None; dias=aeronaves[0].get('dias') or []; target=next((dia for dia in dias if dia.get('data') == target_date), None); (_ for _ in ()).throw(SystemExit(1)) if not target else None; print(target.get('qtd_pic', 0), target.get('status_cobertura', ''))" "$DATA_INICIO")"

if [[ "${QTD_PIC:-0}" -lt 1 ]]; then
  echo "Cobertura não refletiu PIC criado: qtd_pic=$QTD_PIC"
  exit 1
fi
if [[ "$STATUS_COBERTURA" == "gap_pic" || "$STATUS_COBERTURA" == "gap_total" ]]; then
  echo "Status de cobertura inconsistente após criar PIC: $STATUS_COBERTURA"
  exit 1
fi
echo "Cobertura validada: qtd_pic=$QTD_PIC status=$STATUS_COBERTURA"

DELETE_STATUS=$(curl -sS -o /tmp/airtrust-escalas-v2-delete.json -w '%{http_code}' \
  -X DELETE "$BASE/api/escalas/$ESCALA_ID/alocacoes/$ALOCACAO_ID" \
  "${AUTH[@]}")
if [[ "$DELETE_STATUS" != "200" ]]; then
  echo "Falha ao remover alocação de smoke: status=$DELETE_STATUS body=$(cat /tmp/airtrust-escalas-v2-delete.json)"
  exit 1
fi

echo "Smoke v2 OK"