#!/usr/bin/env bash
# cert-dry-run-qa.sh
# Runner operacional para:
# - autenticação efêmera por API
# - validação de contexto da empresa 6
# - dry-run pré-backfill
# - backfill apply sequencial em lotes pequenos e retomáveis
# - pós-check e QA amostral por API
#
# Não imprime credenciais, tokens, cookies ou headers de autorização.
# Não depende de navegador.

set -euo pipefail

if [[ "$-" == *x* ]]; then
  printf '[CERT-BACKFILL][ERROR] xtrace (-x) ativo. Desative antes de continuar.\n' >&2
  exit 1
fi

BASE_URL="${AIRTRUST_BASE_URL:-https://api.airtrust.online}"
EXPECTED_EMPRESA_ID="${AIRTRUST_EXPECTED_EMPRESA_ID:-6}"
INITIAL_LIMIT=5
DEFAULT_LIMIT=10
REDUCED_LIMIT=3
BATCH_PAUSE_SECONDS="${AIRTRUST_BATCH_PAUSE_SECONDS:-4}"
DRY_RUN_LIMIT=500
QR_SAMPLE_TARGET=10
APPLY_HEADER="CONFIRM_BACKFILL_${EXPECTED_EMPRESA_ID}"
TARGET_EMPRESA_NAME="Costa do Sol"

EMAIL="${AIRTRUST_EMAIL:-}"
PASSWORD="${AIRTRUST_PASSWORD:-}"

PASS=0
FAIL=0
SKIP=0

TMP_DIR="$(mktemp -d -t cert-backfill-qa.XXXXXX)"
TMP_LOGIN="$TMP_DIR/login.json"
TMP_ME="$TMP_DIR/me.json"
TMP_EMPRESAS="$TMP_DIR/empresas.json"
TMP_INV_PRE="$TMP_DIR/inventory-pre.json"
TMP_DRY_PRE="$TMP_DIR/dry-pre.json"
TMP_EXCL="$TMP_DIR/exclude-4449.json"
TMP_INV_POST="$TMP_DIR/inventory-post.json"
TMP_DRY_POST="$TMP_DIR/dry-post.json"
TMP_JS="$TMP_DIR/parser.cjs"
TMP_BATCH_DIR="$TMP_DIR/batches"
TMP_QA_DIR="$TMP_DIR/qa"
mkdir -p "$TMP_BATCH_DIR" "$TMP_QA_DIR"

cleanup() {
  rm -rf "$TMP_DIR"
  unset AIRTRUST_EMAIL AIRTRUST_PASSWORD AIRTRUST_AUTH_TOKEN
  unset AUTH_HEADER EMAIL PASSWORD
}
trap cleanup EXIT

log() { printf '[CERT-BACKFILL] %s\n' "$*"; }
pass() { PASS=$((PASS + 1)); printf '[CERT-BACKFILL] PASS  %s\n' "$*"; }
fail() { FAIL=$((FAIL + 1)); printf '[CERT-BACKFILL] FAIL  %s\n' "$*" >&2; }
skip() { SKIP=$((SKIP + 1)); printf '[CERT-BACKFILL] SKIP  %s\n' "$*"; }
die() { printf '[CERT-BACKFILL][ERROR] %s\n' "$*" >&2; exit 1; }

write_node_helper() {
  cat >"$TMP_JS" <<'JSEOF'
const fs = require('node:fs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function maskName(input) {
  return String(input || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) => (index === 0 ? part : `${part[0]}.`))
    .join(' ');
}

function flattenPastaVirtual(data) {
  const groups = data?.data || {};
  return Object.entries(groups).flatMap(([categoria, items]) =>
    Array.isArray(items)
      ? items.map((item) => ({
          categoria,
          nome: item?.nome || null,
          url: item?.url || null,
          id: item?.id || null,
        }))
      : [],
  );
}

const mode = process.argv[2];
const file = process.argv[3];

if (mode === 'extract-token') {
  const payload = readJson(file);
  const token =
    payload?.data?.accessToken ??
    payload?.data?.access_token ??
    payload?.accessToken ??
    payload?.access_token ??
    '';
  if (!token || typeof token !== 'string') process.exit(1);
  process.stdout.write(token.trim());
  process.exit(0);
}

if (mode === 'auth-summary') {
  const me = readJson(file);
  const email = String(me?.data?.email || '');
  const maskedEmail = email.includes('@') ? `***@${email.split('@')[1]}` : 'indisponivel';
  const out = {
    success: !!me?.success,
    role: me?.data?.role || null,
    nome: me?.data?.nome || null,
    email_masked: maskedEmail,
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

if (mode === 'empresa-summary') {
  const payload = readJson(file);
  const empresas = Array.isArray(payload?.data?.empresas) ? payload.data.empresas : [];
  const empresaAtualId = payload?.data?.empresaAtualId ?? null;
  const empresaAtual =
    empresas.find((empresa) => empresa?.id === empresaAtualId) ||
    empresas.find((empresa) => empresa?.is_current === 1 || empresa?.is_current === true) ||
    null;
  const out = {
    empresaAtualId,
    empresaAtualNome: empresaAtual?.nome || null,
    empresasCount: empresas.length,
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

if (mode === 'inventory-summary') {
  const payload = readJson(file);
  const totals = payload?.data?.totals || {};
  const porOrigem = Array.isArray(payload?.data?.por_origem) ? payload.data.por_origem : [];
  process.stdout.write(
    JSON.stringify({
      empresa_id: payload?.data?.empresa_id ?? null,
      total: Number(totals?.total || 0),
      com_certificado: Number(totals?.com_certificado || 0),
      sem_certificado: Number(totals?.sem_certificado || 0),
      por_origem: porOrigem,
    }),
  );
  process.exit(0);
}

if (mode === 'dry-run-summary') {
  const payload = readJson(file);
  const rows = Array.isArray(payload?.data?.registros) ? payload.data.registros : [];
  const out = {
    empresa_id: payload?.data?.empresa_id ?? null,
    count: Number(payload?.data?.count || rows.length || 0),
    limit: Number(payload?.data?.limit || 0),
    historico_ids: rows.map((row) => Number(row?.historico_id)).filter(Number.isFinite),
    sample: rows.slice(0, 10).map((row) => ({
      historico_id: row?.historico_id,
      status: row?.status || null,
      data_conclusao: row?.data_conclusao || null,
      qualificacao_codigo: row?.qualificacao_codigo || null,
      funcionario_nome_masked: maskName(row?.funcionario_nome),
    })),
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

if (mode === 'apply-summary') {
  const payload = readJson(file);
  const data = payload?.data || {};
  const results = Array.isArray(data?.results) ? data.results : [];
  process.stdout.write(
    JSON.stringify({
      processed: Number(data?.processed || 0),
      created: Number(data?.created || 0),
      skipped: Number(data?.skipped || 0),
      errors: Number(data?.errors || 0),
      remaining: Number(data?.remaining || 0),
      cursor: Number(data?.cursor || 0),
      next_cursor: Number(data?.next_cursor || 0),
      historico_ids: results
        .map((row) => Number(row?.historico_id))
        .filter((value) => Number.isFinite(value)),
      created_ids: results
        .filter((row) => row?.state === 'CREATED')
        .map((row) => Number(row?.historico_id))
        .filter((value) => Number.isFinite(value)),
      states: results.map((row) => ({
        historico_id: row?.historico_id,
        state: row?.state || null,
        error: row?.error || null,
      })),
    }),
  );
  process.exit(0);
}

if (mode === 'cert-list-summary') {
  const payload = readJson(file);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  process.stdout.write(
    JSON.stringify(
      rows.map((row) => ({
        id: row?.id ?? null,
        documento_id: row?.documento_id ?? row?.id ?? null,
        pasta_virtual_id: row?.pasta_virtual_id ?? null,
        historico_id: row?.historico_id ?? null,
        funcionario_id: row?.funcionario_id ?? null,
        nome_arquivo: row?.nome_arquivo ?? null,
        r2_key: row?.r2_key ?? null,
        numero_certificado: row?.numero_certificado ?? null,
      })),
    ),
  );
  process.exit(0);
}

if (mode === 'pasta-summary') {
  const payload = readJson(file);
  process.stdout.write(JSON.stringify(flattenPastaVirtual(payload)));
  process.exit(0);
}

if (mode === 'ficha360-summary') {
  const payload = readJson(file);
  const historico = Array.isArray(payload?.data?.qualificacoes_historico)
    ? payload.data.qualificacoes_historico
    : [];
  process.stdout.write(
    JSON.stringify(
      historico.map((row) => ({
        id: row?.id ?? null,
        codigo: row?.codigo ?? null,
        nome: row?.nome ?? null,
        status: row?.status ?? null,
      })),
    ),
  );
  process.exit(0);
}

if (mode === 'download-summary') {
  const payload = readJson(file);
  process.stdout.write(
    JSON.stringify({
      url: payload?.data?.url || null,
      nome: payload?.data?.nome || null,
    }),
  );
  process.exit(0);
}

if (mode === 'validacao-summary') {
  const payload = readJson(file);
  process.stdout.write(
    JSON.stringify({
      success: !!payload?.success,
      valido: !!payload?.valido,
      numero: payload?.certificado?.numero || null,
      qualificacao_codigo: payload?.certificado?.qualificacao_codigo || null,
      funcionario_nome: payload?.certificado?.funcionario_nome || null,
      empresa_nome: payload?.certificado?.empresa_nome || null,
      hash: payload?.certificado?.hash || null,
    }),
  );
  process.exit(0);
}

process.exit(2);
JSEOF
}

json_eval() {
  local mode="$1"
  local file="$2"
  node "$TMP_JS" "$mode" "$file"
}

require_credentials() {
  if [[ -n "$EMAIL" && -n "$PASSWORD" ]]; then
    return 0
  fi

  if [[ -t 0 ]]; then
    read -r -p 'Email/login AirTrust: ' EMAIL
    read -r -s -p 'Senha AirTrust: ' PASSWORD
    printf '\n'
    return 0
  fi

  printf '\n[CERT-BACKFILL] Credenciais ausentes. Exporte antes de executar:\n\n' >&2
  printf '  export AIRTRUST_EMAIL="admin@suaempresa.com"\n' >&2
  printf '  export AIRTRUST_PASSWORD="sua_senha"\n' >&2
  printf '  export AIRTRUST_BASE_URL="https://api.airtrust.online"\n' >&2
  printf '  bash scripts/cert-dry-run-qa.sh\n\n' >&2
  printf 'CERT_BACKFILL=BLOCKED_BY_MISSING_TERMINAL_CREDENTIALS\n' >&2
  exit 1
}

http_request() {
  local method="$1"
  local path="$2"
  local output_file="$3"
  shift 3

  local args=()
  local body=''
  local status

  while (($#)); do
    case "$1" in
      --header)
        args+=(-H "$2")
        shift 2
        ;;
      --body)
        body="$2"
        shift 2
        ;;
      *)
        die "Parâmetro desconhecido em http_request: $1"
        ;;
    esac
  done

  if [[ -n "$body" ]]; then
    status="$(/usr/bin/curl -sS --connect-timeout 20 --max-time 120 -o "$output_file" -w '%{http_code}' \
      -X "$method" "${args[@]}" --data "$body" "${BASE_URL%/}${path}" || true)"
  else
    status="$(/usr/bin/curl -sS --connect-timeout 20 --max-time 120 -o "$output_file" -w '%{http_code}' \
      -X "$method" "${args[@]}" "${BASE_URL%/}${path}" || true)"
  fi

  printf '%s' "$status"
}

login_api() {
  log "Login efêmero via API"
  local payload status
  payload="$(node -e 'const [,email,senha]=process.argv; process.stdout.write(JSON.stringify({email, senha, password: senha}));' -- "$EMAIL" "$PASSWORD")"
  status="$(http_request POST '/api/auth/login' "$TMP_LOGIN" \
    --header 'Content-Type: application/json' \
    --header 'Accept: application/json' \
    --body "$payload")"
  unset payload

  [[ "$status" == "200" ]] || die "Login falhou com HTTP $status"

  AIRTRUST_AUTH_TOKEN="$(json_eval extract-token "$TMP_LOGIN")" || die 'Login 200 sem access token utilizável'
  AUTH_HEADER="Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}"
  pass 'Login CLI → 200'
}

validate_auth_context() {
  local me_status empresas_status auth_summary empresa_summary

  me_status="$(http_request GET '/api/auth/me' "$TMP_ME" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$me_status" == "200" ]] || die "Validação /api/auth/me falhou com HTTP $me_status"

  empresas_status="$(http_request GET '/api/auth/empresas' "$TMP_EMPRESAS" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$empresas_status" == "200" ]] || die "Validação /api/auth/empresas falhou com HTTP $empresas_status"

  auth_summary="$(json_eval auth-summary "$TMP_ME")"
  empresa_summary="$(json_eval empresa-summary "$TMP_EMPRESAS")"

  local role nome masked_email empresa_atual_id empresa_atual_nome empresas_count
  role="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.role || ""));' -- "$auth_summary")"
  nome="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.nome || ""));' -- "$auth_summary")"
  masked_email="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.email_masked || ""));' -- "$auth_summary")"
  empresa_atual_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.empresaAtualId ?? ""));' -- "$empresa_summary")"
  empresa_atual_nome="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.empresaAtualNome || ""));' -- "$empresa_summary")"
  empresas_count="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.empresasCount ?? ""));' -- "$empresa_summary")"

  log "Auth OK: usuario=${nome:-indisponivel} email=${masked_email:-indisponivel} role=${role:-indisponivel}"
  log "Empresa atual: id=${empresa_atual_id:-?} nome=${empresa_atual_nome:-indisponivel} empresas_vinculadas=${empresas_count:-0}"

  [[ "$empresa_atual_id" == "$EXPECTED_EMPRESA_ID" ]] || die "Contexto autenticado não está na empresa ${EXPECTED_EMPRESA_ID} (empresaAtualId=${empresa_atual_id:-nulo})"
  pass "Empresa ativa autenticada → ${EXPECTED_EMPRESA_ID}"
}

log_inventory_summary() {
  local label="$1"
  local file="$2"
  local summary total com sem
  summary="$(json_eval inventory-summary "$file")"
  total="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.total));' -- "$summary")"
  com="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.com_certificado));' -- "$summary")"
  sem="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.sem_certificado));' -- "$summary")"
  log "${label}: total=${total} com_certificado=${com} sem_certificado=${sem}"
  node -e 'const x=JSON.parse(process.argv[1]); if (Array.isArray(x.por_origem)) { for (const row of x.por_origem) console.log(`[CERT-BACKFILL]   origem=${row.origem_tipo} total=${row.total} com=${row.com_certificado} sem=${row.sem_certificado}`); }' -- "$summary"
}

run_precheck() {
  local inv_status dry_status summary dry_summary dry_count sem total_inelegiveis

  log 'Dry-run pré-backfill'
  inv_status="$(http_request GET '/api/certificados/admin/dry-run-inventory' "$TMP_INV_PRE" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$inv_status" == "200" ]] || die "dry-run-inventory falhou com HTTP $inv_status"
  pass 'Pré-check inventory → 200'
  log_inventory_summary 'Inventário pré-backfill' "$TMP_INV_PRE"

  dry_status="$(http_request POST "/api/certificados/admin/backfill-dry-run?limit=${DRY_RUN_LIMIT}" "$TMP_DRY_PRE" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$dry_status" == "200" ]] || die "backfill-dry-run falhou com HTTP $dry_status"
  pass "Pré-check backfill-dry-run → 200"

  dry_summary="$(json_eval dry-run-summary "$TMP_DRY_PRE")"
  dry_count="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.count));' -- "$dry_summary")"
  sem="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.sem_certificado));' -- "$(json_eval inventory-summary "$TMP_INV_PRE")")"
  total_inelegiveis="$(( sem - dry_count ))"
  (( total_inelegiveis < 0 )) && total_inelegiveis=0

  log "Dry-run candidatos elegíveis=${dry_count} inelegíveis_estimados=${total_inelegiveis}"
  node -e 'const x=JSON.parse(process.argv[1]); console.log("[CERT-BACKFILL] Amostra mascarada:"); for (const row of x.sample) console.log(`[CERT-BACKFILL]   historico_id=${row.historico_id} status=${row.status} data=${row.data_conclusao} codigo=${row.qualificacao_codigo} func=${row.funcionario_nome_masked}`);' -- "$dry_summary"

  if node -e 'const x=JSON.parse(process.argv[1]); process.exit(x.historico_ids.includes(4449) ? 0 : 1);' -- "$dry_summary"; then
    fail 'Dry-run listou historico_id=4449; apply continua protegido, mas a leitura prévia não o exclui'
  else
    pass 'Dry-run amostral não mostrou historico_id=4449'
  fi

  local excl_status excl_summary excl_processed excl_remaining
  excl_status="$(http_request POST "/api/certificados/admin/backfill-apply?historicoIds=4449" "$TMP_EXCL" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json' \
    --header "X-Backfill-Authorization: ${APPLY_HEADER}")"
  [[ "$excl_status" == "200" ]] || die "Pre-check de exclusão do 4449 falhou com HTTP $excl_status"
  excl_summary="$(json_eval apply-summary "$TMP_EXCL")"
  excl_processed="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.processed));' -- "$excl_summary")"
  excl_remaining="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.remaining));' -- "$excl_summary")"
  if [[ "$excl_processed" == "0" ]]; then
    pass "Exclusão explícita do historico_id=4449 confirmada no apply protegido"
  else
    fail "Apply protegido para historico_id=4449 processou ${excl_processed} item(ns)"
  fi
  log "Pre-check exclusão 4449: processed=${excl_processed} remaining=${excl_remaining}"

  if [[ "$dry_count" == "0" ]]; then
    skip 'Nenhum candidato elegível sem certificado; apply não será executado'
    return 1
  fi

  return 0
}

run_apply_batches() {
  local cursor=0
  local limit="$INITIAL_LIMIT"
  local batch_number=1
  local reduced_mode=0
  local created_ids=()
  local batch_log_file="$TMP_DIR/backfill-batch-log.txt"
  : >"$batch_log_file"

  log 'Início do backfill apply controlado'

  while :; do
    local batch_file="$TMP_BATCH_DIR/batch-${batch_number}.json"
    local status summary processed created skipped errors remaining next_cursor

    status="$(http_request POST "/api/certificados/admin/backfill-apply?limit=${limit}&cursor=${cursor}" "$batch_file" \
      --header "$AUTH_HEADER" \
      --header 'Accept: application/json' \
      --header "X-Backfill-Authorization: ${APPLY_HEADER}")"

    if [[ "$status" == "429" ]]; then
      if [[ "$limit" -gt "$REDUCED_LIMIT" ]]; then
        log "HTTP 429 no lote ${batch_number}; reduzindo limit para ${REDUCED_LIMIT} e retomando do cursor ${cursor}"
        limit="$REDUCED_LIMIT"
        reduced_mode=1
        sleep "$BATCH_PAUSE_SECONDS"
        continue
      fi
      die "BACKFILL_RATE_LIMITED: HTTP 429 persistente no cursor ${cursor}"
    fi

    if [[ "$status" =~ ^5 ]]; then
      die "BACKFILL_PARTIAL: servidor retornou HTTP ${status} no cursor ${cursor}"
    fi

    [[ "$status" == "200" ]] || die "BACKFILL_PARTIAL: backfill-apply retornou HTTP ${status} no cursor ${cursor}"

    summary="$(json_eval apply-summary "$batch_file")"
    processed="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.processed));' -- "$summary")"
    created="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.created));' -- "$summary")"
    skipped="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.skipped));' -- "$summary")"
    errors="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.errors));' -- "$summary")"
    remaining="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.remaining));' -- "$summary")"
    next_cursor="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.next_cursor));' -- "$summary")"

    if node -e 'const x=JSON.parse(process.argv[1]); process.exit(x.historico_ids.includes(4449) ? 0 : 1);' -- "$summary"; then
      die "TENANT_SCOPE_BUG: lote ${batch_number} retornou historico_id=4449"
    fi

    if [[ "$errors" != "0" ]]; then
      node -e 'const x=JSON.parse(process.argv[1]); for (const row of x.states.filter((item) => item.error)) console.error(`[CERT-BACKFILL] erro historico_id=${row.historico_id} state=${row.state} error=${row.error}`);' -- "$summary" >&2
      die "BACKFILL_PARTIAL: lote ${batch_number} retornou errors=${errors}"
    fi

    while IFS= read -r created_id; do
      [[ -n "$created_id" ]] && created_ids+=("$created_id")
    done < <(node -e 'const x=JSON.parse(process.argv[1]); for (const id of x.created_ids) console.log(String(id));' -- "$summary")

    printf 'lote=%s cursor=%s processed=%s created=%s skipped=%s errors=%s remaining=%s next_cursor=%s limit=%s\n' \
      "$batch_number" "$cursor" "$processed" "$created" "$skipped" "$errors" "$remaining" "$next_cursor" "$limit" | tee -a "$batch_log_file"

    if [[ "$processed" == "0" ]]; then
      log "Nenhum item processado no lote ${batch_number}; encerrando loop"
      break
    fi

    if [[ "$remaining" == "0" ]]; then
      break
    fi

    cursor="$next_cursor"
    if [[ "$batch_number" == "1" && "$reduced_mode" == "0" ]]; then
      limit="$DEFAULT_LIMIT"
    fi
    batch_number="$((batch_number + 1))"
    sleep "$BATCH_PAUSE_SECONDS"
  done

  printf '%s\n' "${created_ids[@]}" | awk 'NF' | sort -n | uniq >"$TMP_DIR/created-ids.txt"
  if [[ ! -s "$TMP_DIR/created-ids.txt" ]]; then
    skip 'Nenhum certificado novo foi criado no backfill apply'
  else
    pass "Backfill apply criou $(wc -l <"$TMP_DIR/created-ids.txt" | tr -d ' ') certificado(s)"
  fi
}

run_postcheck() {
  local inv_status dry_status

  log 'Pós-check do backfill'
  inv_status="$(http_request GET '/api/certificados/admin/dry-run-inventory' "$TMP_INV_POST" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$inv_status" == "200" ]] || die "Pós-check inventory falhou com HTTP $inv_status"
  pass 'Pós-check inventory → 200'
  log_inventory_summary 'Inventário pós-backfill' "$TMP_INV_POST"

  dry_status="$(http_request POST "/api/certificados/admin/backfill-dry-run?limit=${DRY_RUN_LIMIT}" "$TMP_DRY_POST" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$dry_status" == "200" ]] || die "Pós-check backfill-dry-run falhou com HTTP $dry_status"
  pass 'Pós-check backfill-dry-run → 200'

  local inv_summary dry_summary dry_count sem final_inelegiveis
  inv_summary="$(json_eval inventory-summary "$TMP_INV_POST")"
  dry_summary="$(json_eval dry-run-summary "$TMP_DRY_POST")"
  dry_count="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.count));' -- "$dry_summary")"
  sem="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.sem_certificado));' -- "$inv_summary")"
  final_inelegiveis="$(( sem - dry_count ))"
  (( final_inelegiveis < 0 )) && final_inelegiveis=0

  log "Dry-run final elegíveis_restantes=${dry_count} inelegíveis_estimados=${final_inelegiveis}"
  if node -e 'const x=JSON.parse(process.argv[1]); process.exit(x.historico_ids.includes(4449) ? 0 : 1);' -- "$dry_summary"; then
    fail 'Dry-run final listou historico_id=4449'
  else
    pass 'Dry-run final não mostrou historico_id=4449'
  fi
}

qa_single_cert() {
  local historico_id="$1"
  local qa_file_prefix="$TMP_QA_DIR/historico-${historico_id}"
  local cert_file="${qa_file_prefix}-cert.json"
  local pasta_file="${qa_file_prefix}-pasta.json"
  local ficha_file="${qa_file_prefix}-ficha360.json"
  local download_file="${qa_file_prefix}-download.json"
  local pdf_file="${qa_file_prefix}.pdf"
  local valid_file="${qa_file_prefix}-validacao.json"

  local cert_status
  cert_status="$(http_request GET "/api/certificados/historico/${historico_id}/certificados" "$cert_file" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$cert_status" == "200" ]] || die "QA historico ${historico_id}: listar certificados falhou com HTTP ${cert_status}"

  local cert_summary
  cert_summary="$(json_eval cert-list-summary "$cert_file")"
  local documento_id funcionario_id r2_key nome_arquivo numero_certificado
  documento_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String((x[0] && x[0].documento_id) || ""));' -- "$cert_summary")"
  funcionario_id="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String((x[0] && x[0].funcionario_id) || ""));' -- "$cert_summary")"
  r2_key="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String((x[0] && x[0].r2_key) || ""));' -- "$cert_summary")"
  nome_arquivo="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String((x[0] && x[0].nome_arquivo) || ""));' -- "$cert_summary")"
  numero_certificado="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String((x[0] && x[0].numero_certificado) || ""));' -- "$cert_summary")"

  [[ -n "$documento_id" && -n "$funcionario_id" && -n "$r2_key" ]] || die "QA historico ${historico_id}: documento principal ausente"

  local pasta_status
  pasta_status="$(http_request GET "/api/pasta-virtual/by-category/${funcionario_id}" "$pasta_file" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$pasta_status" == "200" ]] || die "QA historico ${historico_id}: pasta virtual falhou com HTTP ${pasta_status}"

  local ficha_status
  ficha_status="$(http_request GET "/api/funcionarios/${funcionario_id}/ficha-360" "$ficha_file" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$ficha_status" == "200" ]] || die "QA historico ${historico_id}: ficha-360 falhou com HTTP ${ficha_status}"

  local download_status
  download_status="$(http_request GET "/api/certificados/download/${documento_id}" "$download_file" \
    --header "$AUTH_HEADER" \
    --header 'Accept: application/json')"
  [[ "$download_status" == "200" ]] || die "QA historico ${historico_id}: endpoint de download falhou com HTTP ${download_status}"

  local download_summary stream_path
  download_summary="$(json_eval download-summary "$download_file")"
  stream_path="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.url || ""));' -- "$download_summary")"
  [[ -n "$stream_path" ]] || die "QA historico ${historico_id}: stream URL ausente"

  /usr/bin/curl -sS --connect-timeout 20 --max-time 120 -o "$pdf_file" \
    -H "$AUTH_HEADER" \
    "${BASE_URL%/}${stream_path}" >/dev/null

  python3 - "$pdf_file" <<'PY'
from pathlib import Path
import re, sys
pdf = Path(sys.argv[1]).read_bytes()
if not pdf.startswith(b'%PDF'):
    raise SystemExit(1)
match = re.search(rb'/validar/([A-F0-9]{16})', pdf)
if not match:
    raise SystemExit(2)
print(match.group(1).decode())
PY
  local qr_hash="$(
    python3 - "$pdf_file" <<'PY'
from pathlib import Path
import re, sys
pdf = Path(sys.argv[1]).read_bytes()
match = re.search(rb'/validar/([A-F0-9]{16})', pdf)
if not match:
    raise SystemExit(1)
print(match.group(1).decode())
PY
  )" || die "QA historico ${historico_id}: hash QR não encontrado no PDF"

  local valid_status
  valid_status="$(http_request GET "/api/certificados/validar/${qr_hash}" "$valid_file" \
    --header 'Accept: application/json')"
  [[ "$valid_status" == "200" ]] || die "QA historico ${historico_id}: validação QR falhou com HTTP ${valid_status}"

  local pasta_contains ficha_contains
  pasta_contains="$(node -e 'const items=JSON.parse(process.argv[1]); const key=process.argv[2]; process.stdout.write(items.some((item) => item.url === key) ? "yes" : "no");' -- "$(json_eval pasta-summary "$pasta_file")" "$r2_key")"
  ficha_contains="$(node -e 'const rows=JSON.parse(process.argv[1]); const id=Number(process.argv[2]); process.stdout.write(rows.some((row) => Number(row.id) === id) ? "yes" : "no");' -- "$(json_eval ficha360-summary "$ficha_file")" "$historico_id")"
  [[ "$pasta_contains" == 'yes' ]] || die "QA historico ${historico_id}: documento não encontrado na pasta virtual"
  [[ "$ficha_contains" == 'yes' ]] || die "QA historico ${historico_id}: histórico não encontrado na ficha 360"

  if [[ ! "$r2_key" =~ ^certificados/empresa-6/ ]]; then
    die "QA historico ${historico_id}: r2_key fora do padrão tenant-scoped (${r2_key})"
  fi
  if [[ "$r2_key" =~ [0-9]{11} ]]; then
    die "QA historico ${historico_id}: r2_key aparenta conter CPF (${r2_key})"
  fi
  if [[ "$r2_key" =~ [A-Za-z]{3,}_[A-Za-z]{3,} ]]; then
    die "QA historico ${historico_id}: r2_key aparenta conter nome sanitizado (${r2_key})"
  fi

  local valid_summary valid_numero valid_empresa valid_func
  valid_summary="$(json_eval validacao-summary "$valid_file")"
  valid_numero="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.numero || ""));' -- "$valid_summary")"
  valid_empresa="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.empresa_nome || ""));' -- "$valid_summary")"
  valid_func="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.funcionario_nome || ""));' -- "$valid_summary")"

  if [[ -n "$numero_certificado" && -n "$valid_numero" && "$numero_certificado" != "$valid_numero" ]]; then
    die "QA historico ${historico_id}: número do certificado divergente (${numero_certificado} != ${valid_numero})"
  fi

  printf '[CERT-BACKFILL] QA historico=%s funcionario_id=%s documento_id=%s numero=%s r2_key=%s empresa=%s funcionario=%s qr_hash=%s\n' \
    "$historico_id" "$funcionario_id" "$documento_id" "${valid_numero:-N/A}" "$r2_key" "${valid_empresa:-N/A}" "${valid_func:-N/A}" "$qr_hash"
}

run_sample_qa() {
  if [[ ! -s "$TMP_DIR/created-ids.txt" ]]; then
    skip 'Sem IDs criados para executar QA amostral'
    return 0
  fi

  local sample_ids_file="$TMP_DIR/sample-ids.txt"
  head -n "$QR_SAMPLE_TARGET" "$TMP_DIR/created-ids.txt" >"$sample_ids_file"
  local sample_count
  sample_count="$(wc -l <"$sample_ids_file" | tr -d ' ')"
  if [[ "$sample_count" -lt 1 ]]; then
    skip 'Amostra QA vazia'
    return 0
  fi

  log "QA amostral de ${sample_count} certificado(s)"
  while IFS= read -r historico_id; do
    [[ -n "$historico_id" ]] || continue
    qa_single_cert "$historico_id"
  done <"$sample_ids_file"

  if [[ "$sample_count" -lt "$QR_SAMPLE_TARGET" ]]; then
    skip "QA executada com ${sample_count} amostra(s); alvo era ${QR_SAMPLE_TARGET}"
  else
    pass "QA amostral de ${sample_count} certificado(s) concluída"
  fi
}

print_summary() {
  printf '\n[CERT-BACKFILL] ===== RESULTADO =====\n'
  printf '[CERT-BACKFILL] PASS=%d FAIL=%d SKIP=%d\n' "$PASS" "$FAIL" "$SKIP"
  if [[ -f "$TMP_DIR/backfill-batch-log.txt" ]]; then
    printf '[CERT-BACKFILL] Lotes:\n'
    sed 's/^/[CERT-BACKFILL]   /' "$TMP_DIR/backfill-batch-log.txt"
  fi
  if (( FAIL > 0 )); then
    printf '[CERT-BACKFILL] DECISAO=NO-GO\n' >&2
    exit 1
  fi
  if (( SKIP > 0 )); then
    printf '[CERT-BACKFILL] DECISAO=GO_COM_RESSALVAS\n'
  else
    printf '[CERT-BACKFILL] DECISAO=CERTIFICADOS_BACKFILL_EMPRESA_6_GO\n'
  fi
}

main() {
  write_node_helper
  require_credentials
  login_api
  validate_auth_context

  if run_precheck; then
    run_apply_batches
    run_postcheck
    run_sample_qa
  fi

  print_summary
}

main "$@"
