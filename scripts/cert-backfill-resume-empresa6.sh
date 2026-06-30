#!/usr/bin/env bash
# cert-backfill-resume-empresa6.sh
# Script resumível para backfill de certificados da empresa 6.
#
# Uso:
#   AIRTRUST_EMAIL=... AIRTRUST_PASSWORD=... bash cert-backfill-resume-empresa6.sh
#
# Parâmetros opcionais (env vars):
#   LIMIT=5                    Tamanho do lote (default: 5)
#   START_CURSOR=0             Cursor inicial (default: 0 = idempotente, pula existentes)
#   SLEEP_SECONDS=5            Pausa entre lotes (default: 5)
#   MAX_BATCHES=               Parar após N lotes (default: sem limite)
#   SKIP_CURSORS=4623          Cursors a pular, separados por vírgula
#   AIRTRUST_BASE_URL          Base URL da API (default: https://api.airtrust.online)
#   AIRTRUST_EXPECTED_EMPRESA_ID  Empresa esperada (default: 6)
#
# Não imprime token, senha ou Authorization header.
# Logs salvos em: logs/cert-backfill-empresa6-YYYYMMDD-HHMM/

set -euo pipefail

# ===== CONFIGURAÇÃO =====
BASE_URL="${AIRTRUST_BASE_URL:-https://api.airtrust.online}"
EXPECTED_EMPRESA_ID="${AIRTRUST_EXPECTED_EMPRESA_ID:-6}"
LIMIT="${LIMIT:-5}"
START_CURSOR="${START_CURSOR:-0}"
SLEEP_SECONDS="${SLEEP_SECONDS:-5}"
MAX_BATCHES="${MAX_BATCHES:-}"
APPLY_HEADER="CONFIRM_BACKFILL_${EXPECTED_EMPRESA_ID}"
DRY_RUN_LIMIT=500

# Parse SKIP_CURSORS into array
IFS=',' read -ra SKIP_LIST <<< "${SKIP_CURSORS:-}"
declare -A SKIP_MAP=()
for sc in "${SKIP_LIST[@]}"; do
  sc_trimmed="$(echo "$sc" | xargs)"
  [[ -n "$sc_trimmed" ]] && SKIP_MAP["$sc_trimmed"]=1
done

# ===== LOGGING =====
LOG_DIR="logs/cert-backfill-empresa6-$(date +%Y%m%d-%H%M)"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/backfill.log"
SUMMARY_FILE="$LOG_DIR/summary.json"
BATCH_DIR="$LOG_DIR/batches"
mkdir -p "$BATCH_DIR"

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG_FILE"; }
log_quiet() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >> "$LOG_FILE"; }

# ===== SANITIZE =====
if [[ "$-" == *x* ]]; then
  log 'ERROR xtrace (-x) ativo. Desative antes de continuar.'
  exit 1
fi

# ===== CREDENCIAIS =====
EMAIL="${AIRTRUST_EMAIL:-}"
PASSWORD="${AIRTRUST_PASSWORD:-}"

if [[ -z "$EMAIL" ]]; then
  read -r -p 'Email/login AirTrust: ' EMAIL
fi
if [[ -z "$PASSWORD" ]]; then
  read -r -s -p 'Senha: ' PASSWORD
  echo >&2
fi

# ===== DIR TEMP =====
TMP_DIR="$(mktemp -d -t cert-resume.XXXXXX)"
TMP_LOGIN="$TMP_DIR/login.json"
TMP_ME="$TMP_DIR/me.json"
TMP_INV="$TMP_DIR/inventory.json"
TMP_DRY="$TMP_DIR/dry-run.json"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

# ===== HELPERS =====
http_post() {
  local path="$1" output="$2" body="$3"; shift 3
  curl -sS --connect-timeout 20 --max-time 180 -o "$output" -w '%{http_code}' \
    -X POST -H "Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}" \
    -H "Accept: application/json" "${@}" \
    --data "$body" "${BASE_URL%/}${path}" || echo '000'
}

http_get() {
  local path="$1" output="$2"; shift 2
  curl -sS --connect-timeout 20 --max-time 60 -o "$output" -w '%{http_code}' \
    -H "Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}" \
    -H "Accept: application/json" "${@}" \
    "${BASE_URL%/}${path}" || echo '000'
}

json_field() {
  local file="$1" field="$2"
  node -e "const d=(JSON.parse(require('fs').readFileSync('$file','utf8')).data||{}); process.stdout.write(String(d.$field||''))" 2>/dev/null
}

# ===== AUTENTICAÇÃO =====
log 'Autenticando...'
http_status="$(curl -sS --connect-timeout 20 --max-time 60 -o "$TMP_LOGIN" -w '%{http_code}' \
  -X POST -H "Content-Type: application/json" -H "Accept: application/json" \
  --data "$(node -e "console.log(JSON.stringify({email:process.argv[1],password:process.argv[2]}))" -- "$EMAIL" "$PASSWORD")" \
  "${BASE_URL%/}/api/auth/login" || echo '000')"

if [[ "$http_status" != "200" ]]; then
  log "ERROR Login falhou com HTTP $http_status"
  exit 1
fi

AIRTRUST_AUTH_TOKEN="$(node -e "
const j=JSON.parse(require('fs').readFileSync('$TMP_LOGIN','utf8'));
const t=j?.data?.accessToken||j?.data?.access_token||'';
if(!t) process.exit(1);
process.stdout.write(t);
" 2>/dev/null)" || { log 'ERROR Token nao encontrado na resposta de login'; exit 1; }

log 'Login OK'

# ===== VALIDAÇÃO =====
log 'Validando sessao...'
me_status="$(http_get '/api/auth/me' "$TMP_ME")"
if [[ "$me_status" != "200" ]]; then
  log "ERROR /api/auth/me retornou HTTP $me_status"
  exit 1
fi

ME_ROLE="$(json_field "$TMP_ME" role)"
ME_NOME="$(json_field "$TMP_ME" nome)"
log "Sessao: $ME_NOME ($ME_ROLE)"

# Verificar se é admin
if [[ "$ME_ROLE" != "ADMINISTRADOR" && "$ME_ROLE" != "admin" ]]; then
  log "ERROR Role insuficiente: $ME_ROLE. Precisa ser ADMINISTRADOR."
  exit 1
fi

# ===== DRY-RUN INICIAL =====
log ''
log '===== DRY-RUN INICIAL ====='

inv_status="$(http_get '/api/certificados/admin/dry-run-inventory' "$TMP_INV")"
if [[ "$inv_status" != "200" ]]; then
  log "ERROR Inventory HTTP $inv_status"
  exit 1
fi

TOTAL=$(json_field "$TMP_INV" 'totals.total')
COM_CERT=$(json_field "$TMP_INV" 'totals.com_certificado')
SEM_CERT=$(json_field "$TMP_INV" 'totals.sem_certificado')

log "Inventario: total=$TOTAL com_cert=$COM_CERT sem_cert=$SEM_CERT"

dry_status="$(http_post "/api/certificados/admin/backfill-dry-run?limit=${DRY_RUN_LIMIT}" "$TMP_DRY" '{}')"
ELIGIBLE_COUNT=$(json_field "$TMP_DRY" count)

log "Elegiveis: $ELIGIBLE_COUNT"

# Check 4449
HAS_4449=$(node -e "
const rows=(JSON.parse(require('fs').readFileSync('$TMP_DRY','utf8')).data?.registros||[]);
process.stdout.write(rows.some(r=>r.historico_id===4449)?'SIM':'NAO');
" 2>/dev/null)
log "4449 nos elegiveis: $HAS_4449"

if [[ "$ELIGIBLE_COUNT" == "0" || "$ELIGIBLE_COUNT" == "" ]]; then
  log 'Nenhum elegivel. Nada a fazer.'
  log 'BACKFILL_RESULT: GO (ja completo)'
  exit 0
fi

# Salvar dry-run inicial
cp "$TMP_DRY" "$LOG_DIR/dry-run-pre.json"
cp "$TMP_INV" "$LOG_DIR/inventory-pre.json"

# ===== PRE-CHECK: 4449 =====
log ''
log '===== PRE-CHECK 4449 ====='
excl_status="$(http_post '/api/certificados/admin/backfill-apply?historicoIds=4449' "$TMP_DIR/excl-4449.json" '{}' \
  -H "X-Backfill-Authorization: ${APPLY_HEADER}")"
EXCL_CREATED=$(json_field "$TMP_DIR/excl-4449.json" created)
log "4449 exclusion: created=$EXCL_CREATED (deve ser 0)"
if [[ "$EXCL_CREATED" != "0" && "$EXCL_CREATED" != "" ]]; then
  log 'CRITICAL 4449 foi tocado! Abortando.'
  exit 1
fi

# ===== BACKFILL APPLY =====
log ''
log '===== BACKFILL APPLY ====='
log "Config: limit=$LIMIT start_cursor=$START_CURSOR sleep=${SLEEP_SECONDS}s max_batches=${MAX_BATCHES:-ilimitado}"
log "Skip cursors: ${SKIP_CURSORS:-nenhum}"
log ''

cursor="$START_CURSOR"
batch=0
total_created=0
total_skipped=0
total_errors=0
consecutive_errors=0
MAX_CONSECUTIVE_ERRORS=4
batches_log='['

while true; do
  batch=$((batch + 1))

  # Check skip list
  if [[ -n "${SKIP_MAP["$cursor"]:-}" ]]; then
    log "PULANDO cursor $cursor (skip list)"
    cursor=$((cursor + 1))
    continue
  fi

  # Check max batches
  if [[ -n "$MAX_BATCHES" && $batch -gt $MAX_BATCHES ]]; then
    log "Limite de $MAX_BATCHES lotes atingido."
    break
  fi

  body_file="$BATCH_DIR/batch-$(printf '%04d' $batch).json"

  log_quiet "Lote $batch: cursor=$cursor limit=$LIMIT"

  http_status="$(curl -sS --connect-timeout 20 --max-time 180 -o "$body_file" -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}" \
    -H "Accept: application/json" \
    -H "X-Backfill-Authorization: ${APPLY_HEADER}" \
    "${BASE_URL%/}/api/certificados/admin/backfill-apply?limit=${LIMIT}&cursor=${cursor}" 2>&1 || echo '000')"

  if [[ "$http_status" == "200" ]]; then
    # Parse response
    batch_data=$(node -e "
      const fs=require('fs');
      const j=JSON.parse(fs.readFileSync('$body_file','utf8'));
      const d=j.data||{};
      const created_ids=(d.results||[]).filter(r=>r.state==='CREATED').map(r=>r.historico_id).join(',');
      const skipped_ids=(d.results||[]).filter(r=>r.state==='SKIPPED').map(r=>r.historico_id).join(',');
      const err_detail=(d.results||[]).filter(r=>r.state==='ERROR').map(r=>r.historico_id+':'+(r.reason||'?')).join(',');
      const has4449=(d.results||[]).some(r=>r.historico_id===4449);
      const out={
        batch: $batch,
        cursor: d.cursor,
        next_cursor: d.next_cursor,
        limit: $LIMIT,
        processed: d.processed,
        created: d.created,
        skipped: d.skipped,
        errors: d.errors,
        remaining: d.remaining,
        created_ids: created_ids || '',
        skipped_ids: skipped_ids || '',
        error_detail: err_detail || '',
        has4449: has4449
      };
      console.log(JSON.stringify(out));
    " 2>/dev/null)

    created=$(echo "$batch_data" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).created||0))" 2>/dev/null || echo 0)
    skipped=$(echo "$batch_data" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).skipped||0))" 2>/dev/null || echo 0)
    errors=$(echo "$batch_data" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).errors||0))" 2>/dev/null || echo 0)
    remaining=$(echo "$batch_data" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).remaining||0))" 2>/dev/null || echo 0)
    next_cursor=$(echo "$batch_data" | node -e "process.stdout.write(String(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).next_cursor||0))" 2>/dev/null || echo 0)

    total_created=$((total_created + created))
    total_skipped=$((total_skipped + skipped))
    total_errors=$((total_errors + errors))
    consecutive_errors=0

    # Human-readable log line
    created_ids=$(echo "$batch_data" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).created_ids||'')" 2>/dev/null || echo '')
    log "LOTE $batch OK cursor=$cursor created=$created skipped=$skipped errors=$errors remaining=$remaining next=$next_cursor${created_ids:+ ids=$created_ids}"

    # Accumulate batch log
    [[ $batch -gt 1 ]] && batches_log+=','
    batches_log+="$batch_data"

    # Check 4449
    has4449=$(echo "$batch_data" | node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).has4449?'SIM':'NAO')" 2>/dev/null)
    if [[ "$has4449" == "SIM" ]]; then
      log 'CRITICAL 4449 apareceu no lote! Abortando.'
      exit 1
    fi

    # Stop conditions
    if [[ "$remaining" == "0" ]]; then
      log ''
      log '===== BACKFILL COMPLETO (remaining=0) ====='
      break
    fi

    if [[ "$next_cursor" == "0" || "$next_cursor" == "$cursor" ]]; then
      log "WARNING Cursor nao avancou ($cursor -> $next_cursor). Parando."
      break
    fi

    cursor="$next_cursor"

  elif [[ "$http_status" == "503" || "$http_status" == "429" || "$http_status" =~ ^5 ]]; then
    log "LOTE $batch HTTP_${http_status} cursor=$cursor"
    consecutive_errors=$((consecutive_errors + 1))
    sleep $((10 + consecutive_errors * 5))
  else
    log "LOTE $batch HTTP_${http_status} cursor=$cursor (inesperado)"
    consecutive_errors=$((consecutive_errors + 1))
    sleep 5
  fi

  if [[ $consecutive_errors -ge $MAX_CONSECUTIVE_ERRORS ]]; then
    log "CRITICAL $MAX_CONSECUTIVE_ERRORS erros consecutivos. Parando no cursor=$cursor."
    break
  fi

  sleep "$SLEEP_SECONDS"
done

batches_log+=']'

# ===== DRY-RUN FINAL =====
log ''
log '===== DRY-RUN FINAL ====='

inv_post_status="$(http_get '/api/certificados/admin/dry-run-inventory' "$TMP_INV")"
TOTAL_POST=$(json_field "$TMP_INV" 'totals.total')
COM_CERT_POST=$(json_field "$TMP_INV" 'totals.com_certificado')
SEM_CERT_POST=$(json_field "$TMP_INV" 'totals.sem_certificado')

dry_post_status="$(http_post "/api/certificados/admin/backfill-dry-run?limit=${DRY_RUN_LIMIT}" "$TMP_DRY" '{}')"
ELIGIBLE_POST=$(json_field "$TMP_DRY" count)

log "Final: total=$TOTAL_POST com_cert=$COM_CERT_POST sem_cert=$SEM_CERT_POST elegiveis=$ELIGIBLE_POST"

cp "$TMP_INV" "$LOG_DIR/inventory-post.json"
cp "$TMP_DRY" "$LOG_DIR/dry-run-post.json"

# ===== SUMMARY =====
SUMMARY=$(node -e "
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  empresa_id: $EXPECTED_EMPRESA_ID,
  pre: { total: $TOTAL, com_certificado: $COM_CERT, sem_certificado: $SEM_CERT, elegiveis: $ELIGIBLE_COUNT },
  post: { total: $TOTAL_POST, com_certificado: $COM_CERT_POST, sem_certificado: $SEM_CERT_POST, elegiveis: $ELIGIBLE_POST },
  batches: { total: $batch, created: $total_created, skipped: $total_skipped, errors: $total_errors },
  last_cursor: '$cursor',
  limit: $LIMIT,
  skip_cursors: '${SKIP_CURSORS:-}',
  batches_detail: $batches_log
}, null, 2));
")
echo "$SUMMARY" > "$SUMMARY_FILE"

log ''
log '===== RESUMO FINAL ====='
log "Pre-backfill:  total=$TOTAL  com=$COM_CERT  sem=$SEM_CERT  elegiveis=$ELIGIBLE_COUNT"
log "Pos-backfill:  total=$TOTAL_POST  com=$COM_CERT_POST  sem=$SEM_CERT_POST  elegiveis=$ELIGIBLE_POST"
log "Criados: $total_created | Skipped: $total_skipped | Erros: $total_errors | Lotes: $batch"
log "Logs: $LOG_DIR"
log "Summary: $SUMMARY_FILE"

if [[ "$ELIGIBLE_POST" == "0" || "$SEM_CERT_POST" == "0" ]]; then
  log 'BACKFILL_RESULT: GO'
else
  log "BACKFILL_RESULT: GO_COM_RESSALVAS (${ELIGIBLE_POST:-?} elegiveis restantes)"
fi

log 'Concluido.'
