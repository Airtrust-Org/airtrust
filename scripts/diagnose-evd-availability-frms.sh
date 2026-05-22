#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-https://api.airtrust.online}"
DATE="${DATE:-$(date +%F)}"
DATA_ESCALA="$DATE"
DATA_MONTAGEM="${DATA_MONTAGEM:-$(date +%F)}"
TOKEN="${TOKEN:-}"
AERONAVE_ID_INPUT="${AERONAVE_ID:-}"
ESCALA_ID_INPUT="${ESCALA_ID:-}"

if [[ "$DATA_ESCALA" > "$DATA_MONTAGEM" ]]; then
  DATA_FRMS_REFERENCIA="$DATA_MONTAGEM"
else
  DATA_FRMS_REFERENCIA="$DATA_ESCALA"
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "[ERRO] jq não encontrado. Instale jq para executar o diagnóstico."
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "[ERRO] TOKEN ausente. Use: TOKEN=<jwt> DATE=${DATE} DATA_MONTAGEM=${DATA_MONTAGEM} API_BASE=${API_BASE} bash scripts/diagnose-evd-availability-frms.sh"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

AER_BODY="$TMP_DIR/aeronaves.json"
TRIP_BODY="$TMP_DIR/tripulantes.json"
FAT_BODY="$TMP_DIR/frms_daily_fatigue.json"
ALT_BODY="$TMP_DIR/frms_daily_alerts.json"

AER_STATUS="000"
TRIP_STATUS="000"
FAT_STATUS="000"
ALT_STATUS="000"

safe_curl_get() {
  local url="$1"
  local body_file="$2"
  curl -sS -o "$body_file" -w "%{http_code}" \
    -H "Authorization: Bearer ${TOKEN}" \
    "$url" || echo "000"
}

json_success() {
  local body_file="$1"
  jq -r 'if type=="object" and has("success") then (.success|tostring) else "true" end' "$body_file" 2>/dev/null || echo "false"
}

json_error() {
  local body_file="$1"
  jq -r 'if type=="object" then (.error // .message // "") else "" end' "$body_file" 2>/dev/null || true
}

extract_aeronaves_count() {
  jq -r '
    if type=="array" then length
    elif type=="object" and (.data|type)=="array" then (.data|length)
    else 0 end
  ' "$AER_BODY" 2>/dev/null || echo 0
}

extract_first_aeronave() {
  jq -r '
    def arr:
      if type=="array" then .
      elif type=="object" and (.data|type)=="array" then .data
      else [] end;
    (arr[0] // {}) | "\(.id // "")|\(.prefixo // "")|\(.modelo // "")"
  ' "$AER_BODY" 2>/dev/null || echo "||"
}

extract_tripulantes_summary() {
  jq -r '
    def trip:
      if type=="object" and (.data|type)=="object" and (.data.tripulantes|type)=="array" then .data.tripulantes
      elif type=="object" and (.tripulantes|type)=="array" then .tripulantes
      else [] end;
    {
      total: (trip|length),
      elegiveis: (trip|map(select(.pode_ser_alocado==true))|length),
      elegiveis_sem_conflito: (trip|map(select(.pode_ser_alocado==true and (.soft_conflict//false)==false))|length),
      elegiveis_conflito_mensal: (trip|map(select(.pode_ser_alocado==true and (.soft_conflict//false)==true))|length),
      soft_conflict_quinzena: (
        trip
        | map(select((.soft_conflict//false)==true and (.conflict_code // "") == "OUT_OF_QUINZENA"))
        | length
      ),
      hard_blocks: (
        trip
        | map(select(.pode_ser_alocado!=true))
        | length
      ),
      motivos_bloqueio_duro: (
        trip
        | map(select(.pode_ser_alocado!=true and ((.conflict_code // "") != "OUT_OF_QUINZENA")) | (.motivo_bloqueio // "sem_motivo"))
        | group_by(.)
        | map({motivo: .[0], count: length})
      ),
      conflitos_mensais: (
        trip
        | map(select(.pode_ser_alocado==true and (.soft_conflict//false)==true) | (.conflict_reason // (.conflict_code // "conflito_escala")))
        | group_by(.)
        | map({motivo: .[0], count: length})
      ),
      status_operacional: (
        trip
        | map(.status_operacional // "SEM_STATUS")
        | group_by(.)
        | map({status: .[0], count: length})
      )
    }
  ' "$TRIP_BODY" 2>/dev/null || echo '{"total":0,"elegiveis":0,"elegiveis_sem_conflito":0,"elegiveis_conflito_mensal":0,"fora_quinzena":0,"hard_blocks":0,"motivos_bloqueio_duro":[],"conflitos_mensais":[],"status_operacional":[]}'
}

extract_frms_statuses() {
  jq -r '
    if type=="object" and (.data|type)=="object" and (.data.items|type)=="array" then
      (.data.items | map(.status // "unknown") | group_by(.) | map({status:.[0], count:length}))
    elif type=="object" and (.data|type)=="object" and (.data.status != null) then
      [{status:(.data.status|tostring), count:1}]
    else
      []
    end
  ' "$FAT_BODY" 2>/dev/null || echo '[]'
}

extract_alert_count() {
  jq -r '
    if type=="object" and (.data|type)=="object" then
      (.data.count // ((.data.items // []) | length) // 0)
    else 0 end
  ' "$ALT_BODY" 2>/dev/null || echo 0
}

detect_sensitive_fields() {
  local body_file="$1"
  jq -r '
    [
      .. | objects | to_entries[]? | .key
      | select(test("kss|sintom|meds|alcool|observac|sleep|horas_sono"; "i"))
    ]
    | unique
    | .[]
  ' "$body_file" 2>/dev/null || true
}

DAY="${DATE##*-}"
if [[ "$DAY" =~ ^[0-9]+$ ]] && ((10#$DAY <= 15)); then
  QUINZENA="primeira"
else
  QUINZENA="segunda"
fi

AER_STATUS="$(safe_curl_get "${API_BASE}/api/aeronaves?somente_ativas=1" "$AER_BODY")"
AER_SUCCESS="$(json_success "$AER_BODY")"
AER_ERROR="$(json_error "$AER_BODY")"

AERONAVE_ID="$AERONAVE_ID_INPUT"
AERONAVE_PREFIXO=""
AERONAVE_MODELO=""

if [[ -z "$AERONAVE_ID" ]]; then
  FIRST_AER="$(extract_first_aeronave)"
  AERONAVE_ID="${FIRST_AER%%|*}"
  REST="${FIRST_AER#*|}"
  AERONAVE_PREFIXO="${REST%%|*}"
  AERONAVE_MODELO="${REST#*|}"
fi

if [[ -n "$AERONAVE_ID" ]]; then
  TRIP_URL="${API_BASE}/api/escalas/tripulantes-operacionais?aeronave_id=${AERONAVE_ID}&data_inicio=${DATE}&data_fim=${DATE}&quinzena=${QUINZENA}&incluir_bloqueados=true"
  if [[ -n "$ESCALA_ID_INPUT" ]]; then
    TRIP_URL="${TRIP_URL}&escala_id=${ESCALA_ID_INPUT}"
  fi
  TRIP_STATUS="$(safe_curl_get "$TRIP_URL" "$TRIP_BODY")"
else
  printf '{"success":false,"error":"Sem aeronave ativa para consultar tripulantes"}\n' > "$TRIP_BODY"
fi
TRIP_SUCCESS="$(json_success "$TRIP_BODY")"
TRIP_ERROR="$(json_error "$TRIP_BODY")"

FAT_STATUS="$(safe_curl_get "${API_BASE}/api/frms/daily-fatigue?date=${DATA_FRMS_REFERENCIA}&scope=team" "$FAT_BODY")"
FAT_SUCCESS="$(json_success "$FAT_BODY")"
FAT_ERROR="$(json_error "$FAT_BODY")"

ALT_STATUS="$(safe_curl_get "${API_BASE}/api/frms/daily-fatigue/alerts?date=${DATA_FRMS_REFERENCIA}" "$ALT_BODY")"
ALT_SUCCESS="$(json_success "$ALT_BODY")"
ALT_ERROR="$(json_error "$ALT_BODY")"

AER_COUNT="$(extract_aeronaves_count)"
TRIP_SUMMARY="$(extract_tripulantes_summary)"
FRMS_STATUSES="$(extract_frms_statuses)"
ALERT_COUNT="$(extract_alert_count)"
FRMS_NOT_SUBMITTED_COUNT="$(echo "$FRMS_STATUSES" | jq -r 'map(select(.status=="not_submitted") | .count) | add // 0')"

SENSITIVE_KEYS_ALL="$TMP_DIR/sensitive_keys.txt"
: > "$SENSITIVE_KEYS_ALL"
detect_sensitive_fields "$FAT_BODY" >> "$SENSITIVE_KEYS_ALL"
detect_sensitive_fields "$ALT_BODY" >> "$SENSITIVE_KEYS_ALL"
if [[ -f "$TRIP_BODY" ]]; then
  detect_sensitive_fields "$TRIP_BODY" >> "$SENSITIVE_KEYS_ALL"
fi
sort -u "$SENSITIVE_KEYS_ALL" -o "$SENSITIVE_KEYS_ALL"
SENSITIVE_COUNT="$(grep -c . "$SENSITIVE_KEYS_ALL" || true)"

TRIP_URL_LOG="${API_BASE}/api/escalas/tripulantes-operacionais?aeronave_id=${AERONAVE_ID:-N/A}&data_inicio=${DATE}&data_fim=${DATE}&quinzena=${QUINZENA}&incluir_bloqueados=true"
if [[ -n "$ESCALA_ID_INPUT" ]]; then
  TRIP_URL_LOG="${TRIP_URL_LOG}&escala_id=${ESCALA_ID_INPUT}"
else
  TRIP_URL_LOG="${TRIP_URL_LOG} [sem escala_id — conflitos da mesma escala mensal podem aparecer]"
fi

echo "=== AirTrust EVD/FRMS Diagnose (read-only) ==="
echo "data_escala=${DATA_ESCALA}"
echo "data_montagem=${DATA_MONTAGEM}"
echo "data_frms_referencia=${DATA_FRMS_REFERENCIA}"
echo "api_base=${API_BASE}"
echo "quinzena=${QUINZENA}"
echo "escala_id=${ESCALA_ID_INPUT:-não informado}"
echo

echo "[URLs chamadas (sem token)]"
echo "- aeronaves:    ${API_BASE}/api/aeronaves?somente_ativas=1"
echo "- tripulantes:  ${TRIP_URL_LOG}"
echo "- frms-daily:   ${API_BASE}/api/frms/daily-fatigue?date=${DATA_FRMS_REFERENCIA}&scope=team"
echo "- frms-alerts:  ${API_BASE}/api/frms/daily-fatigue/alerts?date=${DATA_FRMS_REFERENCIA}"
echo

echo "[HTTP status]"
echo "- /api/aeronaves?somente_ativas=1 -> ${AER_STATUS} (success=${AER_SUCCESS})"
echo "- /api/escalas/tripulantes-operacionais -> ${TRIP_STATUS} (success=${TRIP_SUCCESS})"
echo "- /api/frms/daily-fatigue?date=${DATA_FRMS_REFERENCIA}&scope=team -> ${FAT_STATUS} (success=${FAT_SUCCESS})"
echo "- /api/frms/daily-fatigue/alerts?date=${DATA_FRMS_REFERENCIA} -> ${ALT_STATUS} (success=${ALT_SUCCESS})"
echo

echo "[Resumo]"
echo "- aeronaves_ativas: ${AER_COUNT}"
echo "- aeronave_utilizada: id=${AERONAVE_ID:-N/A} prefixo=${AERONAVE_PREFIXO:-N/A} modelo=${AERONAVE_MODELO:-N/A}"
echo "- tripulantes_total:               $(echo "$TRIP_SUMMARY" | jq -r '.total')"
echo "- tripulantes_elegiveis_total:     $(echo "$TRIP_SUMMARY" | jq -r '.elegiveis')"
echo "- elegiveis_sem_conflito:          $(echo "$TRIP_SUMMARY" | jq -r '.elegiveis_sem_conflito')"
echo "- elegiveis_soft_conflict:         $(echo "$TRIP_SUMMARY" | jq -r '.elegiveis_conflito_mensal')"
echo "- soft_conflict_quinzena:          $(echo "$TRIP_SUMMARY" | jq -r '.soft_conflict_quinzena')"
echo "- hard_blocks:                     $(echo "$TRIP_SUMMARY" | jq -r '.hard_blocks')"
echo "- motivos_hard_block:"
echo "$TRIP_SUMMARY" | jq -r '.motivos_bloqueio_duro[]? | "  * \(.motivo): \(.count)"' || true
echo "- soft_conflicts_mensais_por_motivo:"
echo "$TRIP_SUMMARY" | jq -r '.conflitos_mensais[]? | "  * \(.motivo): \(.count)"' || true
echo "- status_operacional_tripulantes:"
echo "$TRIP_SUMMARY" | jq -r '.status_operacional[]? | "  * \(.status): \(.count)"' || true
echo "- frms_daily_statuses:"
echo "$FRMS_STATUSES" | jq -r '.[]? | "  * \(.status): \(.count)"' || true
echo "- frms_alert_count: ${ALERT_COUNT}"
if [[ "$DATA_ESCALA" > "$DATA_FRMS_REFERENCIA" ]]; then
  echo "- not_submitted_futuro_ignorado: sim (escala futura usa referência D-1)"
  echo "- not_submitted_na_referencia: ${FRMS_NOT_SUBMITTED_COUNT}"
else
  echo "- not_submitted_futuro_ignorado: não (escala no mesmo dia da referência)"
fi

echo
echo "[Erros de endpoint]"
[[ "$AER_STATUS" -ge 400 || "$AER_SUCCESS" != "true" ]] && echo "- aeronaves: HTTP=${AER_STATUS} erro=${AER_ERROR:-sem_detalhe}"
if [[ "$TRIP_STATUS" -ge 400 || "$TRIP_SUCCESS" != "true" ]]; then
  echo "- tripulantes-operacionais: HTTP=${TRIP_STATUS} erro=${TRIP_ERROR:-sem_detalhe}"
fi
if [[ "$FAT_STATUS" -ge 400 || "$FAT_SUCCESS" != "true" ]]; then
  echo "- frms daily-fatigue [CRÍTICO]: HTTP=${FAT_STATUS} erro=${FAT_ERROR:-sem_detalhe}"
  echo "  IMPACTO: coluna FRMS da EVD pode ficar incompleta"
fi
if [[ "$ALT_STATUS" -ge 400 || "$ALT_SUCCESS" != "true" ]]; then
  echo "- frms alerts [MENOR]: HTTP=${ALT_STATUS} erro=${ALT_ERROR:-sem_detalhe}"
  echo "  IMPACTO: alertas FRMS adicionais não exibidos; daily-fatigue segue como fonte primária"
fi
if [[ "$AER_STATUS" -lt 400 && "$AER_SUCCESS" == "true" && "$TRIP_STATUS" -lt 400 && "$TRIP_SUCCESS" == "true" && "$FAT_STATUS" -lt 400 && "$FAT_SUCCESS" == "true" && "$ALT_STATUS" -lt 400 && "$ALT_SUCCESS" == "true" ]]; then
  echo "- nenhum erro HTTP detectado"
fi

echo
echo "[Privacidade - campos sensíveis detectados nos payloads analisados]"
if [[ "$SENSITIVE_COUNT" -gt 0 ]]; then
  while IFS= read -r key; do
    [[ -n "$key" ]] && echo "- ${key}"
  done < "$SENSITIVE_KEYS_ALL"
else
  echo "- nenhum campo sensível detectado"
fi
