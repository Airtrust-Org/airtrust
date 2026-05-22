#!/usr/bin/env bash
# Teste funcional controlado da EDV (aircraft-first)
# Requer: curl + jq
# Uso:
#   TOKEN=<jwt> DATE=2026-05-21 API_BASE=https://api.airtrust.online bash scripts/test-evd-functional.sh

set -euo pipefail

API_BASE="${API_BASE:-https://api.airtrust.online}"
DATE="${DATE:-$(date +%Y-%m-%d)}"
TOKEN="${TOKEN:-}"

PASS=0
FAIL=0
SKIP=0
CREATED_ID=""

check() { echo "[PASS] $1"; PASS=$((PASS + 1)); }
fail() { echo "[FAIL] $1"; FAIL=$((FAIL + 1)); }
skip() { echo "[SKIP] $1"; SKIP=$((SKIP + 1)); }

if [[ -z "$TOKEN" ]]; then
  echo "[ERRO] TOKEN ausente. Defina TOKEN no ambiente."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[ERRO] jq não encontrado."
  exit 1
fi

AUTH=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

cleanup() {
  if [[ -n "$CREATED_ID" ]]; then
    curl -s -X DELETE "${AUTH[@]}" "${API_BASE}/api/evd/${CREATED_ID}" >/dev/null || true
  fi
}
trap cleanup EXIT

echo "EDV functional test"
echo "API_BASE=${API_BASE}"
echo "DATE=${DATE}"

# 1) GET /api/evd?data=DATE
LIST_RESP=$(curl -s "${AUTH[@]}" "${API_BASE}/api/evd?data=${DATE}")
if [[ "$(echo "$LIST_RESP" | jq -r '.success // false')" == "true" ]]; then
  CNT=$(echo "$LIST_RESP" | jq '.data | length')
  check "1) GET /api/evd?data=DATE (itens=${CNT})"
else
  fail "1) GET /api/evd?data=DATE"
fi

# Pré-condição: aeronave ativa
AER_RESP=$(curl -s "${AUTH[@]}" "${API_BASE}/api/aeronaves")
AER_ID=$(echo "$AER_RESP" | jq -r '
  .data // []
  | map(select((.status // "ATIVO" | ascii_upcase) != "INATIVO" and (.deleted_at // null) == null))
  | .[0].id // empty')
AER_PREFIXO=$(echo "$AER_RESP" | jq -r '
  .data // []
  | map(select((.status // "ATIVO" | ascii_upcase) != "INATIVO" and (.deleted_at // null) == null))
  | .[0].prefixo // empty')
AER_MODELO=$(echo "$AER_RESP" | jq -r '
  .data // []
  | map(select((.status // "ATIVO" | ascii_upcase) != "INATIVO" and (.deleted_at // null) == null))
  | .[0].modelo // empty')

if [[ -z "$AER_ID" || -z "$AER_PREFIXO" ]]; then
  skip "SKIPPED: sem aeronave ativa"
  echo "Resumo: PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}"
  exit 0
fi

# Pré-condição: tripulantes elegíveis
QUINZENA="primeira"
DAY=$(echo "$DATE" | awk -F- '{print $3}')
if [[ "$DAY" -gt 15 ]]; then
  QUINZENA="segunda"
fi

CREW_URL="${API_BASE}/api/escalas/tripulantes-operacionais?aeronave_id=${AER_ID}&incluir_bloqueados=true&data_inicio=${DATE}&data_fim=${DATE}&quinzena=${QUINZENA}"
CREW_RESP=$(curl -s "${AUTH[@]}" "$CREW_URL")
PIC_ID=$(echo "$CREW_RESP" | jq -r '.data.tripulantes // [] | map(select(.pode_ser_alocado == true)) | .[0].funcionario_id // empty')
SIC_ID=$(echo "$CREW_RESP" | jq -r '.data.tripulantes // [] | map(select(.pode_ser_alocado == true)) | .[1].funcionario_id // empty')

if [[ -z "$PIC_ID" || -z "$SIC_ID" ]]; then
  skip "SKIPPED: sem tripulantes elegíveis"
  echo "Resumo: PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}"
  exit 0
fi

# 2) criação de atribuição por aeronave
OBS_TESTE="TESTE FUNCIONAL EDV — pode remover"
CREATE_PAYLOAD=$(jq -nc \
  --arg data "$DATE" \
  --arg prefixo "$AER_PREFIXO" \
  --arg modelo "$AER_MODELO" \
  --argjson pic "$PIC_ID" \
  --argjson sic "$SIC_ID" \
  --arg obs "$OBS_TESTE" \
  '{data:$data,aeronave_prefixo:$prefixo,aeronave_modelo:$modelo,pic_id:$pic,sic_id:$sic,pic_funcao:"PIC",sic_funcao:"SIC",hora_apresentacao:"06:00",hora_decolagem_prevista:"07:00",hora_pouso_previsto:"10:00",origem:"SBCB",tipo_missao:"OFFSHORE",observacoes:$obs}')
CREATE_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$CREATE_PAYLOAD" "${API_BASE}/api/evd")
if [[ "$(echo "$CREATE_RESP" | jq -r '.success // false')" == "true" ]]; then
  CREATED_ID=$(echo "$CREATE_RESP" | jq -r '.data.id')
  check "2) criação por aeronave (id=${CREATED_ID})"
else
  fail "2) criação por aeronave"
  echo "$CREATE_RESP" | jq -c '.'
  echo "Resumo: PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}"
  exit 1
fi

# 3) bloqueio PIC=SIC
DUP_PAYLOAD=$(jq -nc \
  --arg data "$DATE" \
  --arg prefixo "$AER_PREFIXO" \
  --arg modelo "$AER_MODELO" \
  --argjson same "$PIC_ID" \
  '{data:$data,aeronave_prefixo:$prefixo,aeronave_modelo:$modelo,pic_id:$same,sic_id:$same,tipo_missao:"OFFSHORE"}')
DUP_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$DUP_PAYLOAD" "${API_BASE}/api/evd")
if [[ "$(echo "$DUP_RESP" | jq -r '.success // true')" == "false" ]]; then
  check "3) bloqueio PIC=SIC"
else
  fail "3) bloqueio PIC=SIC"
fi

# 4) justificativa estruturada (se aplicável)
REQ_JUST=$(echo "$CREATE_RESP" | jq -r '.data.require_justificativa_operacional // false')
if [[ "$REQ_JUST" == "true" ]]; then
  JUST_PAYLOAD='{"origem_alerta":"OPERACIONAL","decisao":"MANTER_ESCALA","justificativa":"Teste funcional de justificativa estruturada para publicação controlada."}'
  JUST_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$JUST_PAYLOAD" "${API_BASE}/api/evd/${CREATED_ID}/justificativas")
  if [[ "$(echo "$JUST_RESP" | jq -r '.success // false')" == "true" ]]; then
    check "4) justificativa estruturada"
  else
    fail "4) justificativa estruturada"
  fi
else
  skip "4) justificativa estruturada (não aplicável)"
fi

# 5) publicação por data
PUB_PAYLOAD=$(jq -nc --arg date "$DATE" --arg obs "$OBS_TESTE" '{data_ref:$date,observacoes:$obs}')
PUB_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$PUB_PAYLOAD" "${API_BASE}/api/evd/publicacoes")
PUB_ID=$(echo "$PUB_RESP" | jq -r '.data.id // empty')
if [[ "$(echo "$PUB_RESP" | jq -r '.success // false')" == "true" && -n "$PUB_ID" ]]; then
  check "5) publicação por data"
else
  fail "5) publicação por data"
fi

# 6) listagem de revisões
REV_RESP=$(curl -s "${AUTH[@]}" "${API_BASE}/api/evd/publicacoes?data=${DATE}")
if [[ "$(echo "$REV_RESP" | jq -r '.success // false')" == "true" ]]; then
  check "6) listagem de revisões"
else
  fail "6) listagem de revisões"
fi

# 7) detalhe do snapshot
SNAP_RESP=""
if [[ -n "$PUB_ID" ]]; then
  SNAP_RESP=$(curl -s "${AUTH[@]}" "${API_BASE}/api/evd/publicacoes/${PUB_ID}")
  if [[ "$(echo "$SNAP_RESP" | jq -r '.success // false')" == "true" ]]; then
    check "7) detalhe do snapshot"
  else
    fail "7) detalhe do snapshot"
  fi
else
  skip "7) detalhe do snapshot (sem publicação)"
fi

# 8) ausência de campos sensíveis FRMS no snapshot
if [[ -n "$SNAP_RESP" ]]; then
  FRMS_INCLUDED=$(echo "$SNAP_RESP" | jq -r '.data.payload_json.frms_resumo.included // "missing"')
  HAS_SENSITIVE=$(echo "$SNAP_RESP" | jq -e '
    .data.payload_json
    | tostring
    | test("kss|horas_sono|medicamentos|alcool|sintomas"; "i")
  ' >/dev/null 2>&1; echo $?)

  if [[ "$FRMS_INCLUDED" == "false" && "$HAS_SENSITIVE" -ne 0 ]]; then
    check "8) snapshot sem campos sensíveis FRMS"
  else
    fail "8) snapshot sem campos sensíveis FRMS"
  fi
else
  skip "8) snapshot sem campos sensíveis FRMS (sem snapshot)"
fi

echo "Resumo: PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP}"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
exit 0
