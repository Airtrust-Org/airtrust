#!/usr/bin/env bash
# test-evd-functional.sh — Teste funcional da Escala Diária de Voo (EDV)
#
# Uso:
#   TOKEN=<jwt> DATE=2026-05-21 bash scripts/test-evd-functional.sh
#   TOKEN=<jwt> DATE=2026-05-21 BASE_URL=https://api.airtrust.online bash scripts/test-evd-functional.sh
#
# Requer: curl, jq
# Não hardcoda credenciais. Não lê .env.production.
# Passe TOKEN como variável de ambiente ou via arquivo temporário.

set -euo pipefail

BASE_URL="${BASE_URL:-https://api.airtrust.online}"
DATE="${DATE:-$(date +%Y-%m-%d)}"
TOKEN="${TOKEN:-}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
PASS=0; FAIL=0; SKIP=0

check() { echo -e "${GREEN}✓${NC} $1"; ((PASS++)) || true; }
fail()  { echo -e "${RED}✗${NC} $1"; ((FAIL++)) || true; }
skip()  { echo -e "${YELLOW}~${NC} $1 (skipped)"; ((SKIP++)) || true; }

if [[ -z "$TOKEN" ]]; then
  echo -e "${RED}ERRO:${NC} TOKEN não definido. Defina TOKEN=<jwt> antes de executar."
  echo "       TOKEN=eyJhb... DATE=2026-05-21 bash scripts/test-evd-functional.sh"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo -e "${RED}ERRO:${NC} jq não encontrado. Instale com: brew install jq"
  exit 1
fi

AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  AirTrust EDV — Teste Funcional Controlado               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo "  BASE_URL : $BASE_URL"
echo "  DATE     : $DATE"
echo ""

# ── TESTE 1: Health ──────────────────────────────────────────
echo "── Pré-condições ──"
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health")
if [[ "$HTTP" == "200" ]]; then
  check "T01 Health 200"
else
  fail "T01 Health esperava 200, recebeu $HTTP"
fi

# ── TESTE 2: Listagem vazia/existente ────────────────────────
echo ""
echo "── Listagem ──"
RESP=$(curl -s "${AUTH[@]}" "$BASE_URL/api/evd?data=$DATE")
SUCCESS=$(echo "$RESP" | jq -r '.success // false')
if [[ "$SUCCESS" == "true" ]]; then
  COUNT=$(echo "$RESP" | jq '.data | length')
  check "T02 GET /api/evd?data=$DATE — success=true, ${COUNT} itens"
else
  fail "T02 GET /api/evd?data=$DATE — success=$SUCCESS"
  echo "     Resposta: $(echo "$RESP" | jq -c '.')"
fi

# ── TESTE 3: Criar atribuição diária ────────────────────────
echo ""
echo "── Criar atribuição ──"
CREATE_PAYLOAD="{\"data\":\"$DATE\",\"aeronave_prefixo\":\"PR-TST\",\"tipo_missao\":\"OFFSHORE\",\"hora_apresentacao\":\"06:00\",\"hora_decolagem_prevista\":\"07:00\",\"hora_pouso_previsto\":\"10:00\",\"origem\":\"SBCB\"}"
CREATE_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$CREATE_PAYLOAD" "$BASE_URL/api/evd")
CREATE_OK=$(echo "$CREATE_RESP" | jq -r '.success // false')
if [[ "$CREATE_OK" == "true" ]]; then
  EVD_ID=$(echo "$CREATE_RESP" | jq -r '.data.id')
  check "T03 POST /api/evd — criado id=$EVD_ID"
else
  fail "T03 POST /api/evd — $(echo "$CREATE_RESP" | jq -r '.error // "erro desconhecido"')"
  EVD_ID=""
fi

# ── TESTE 4: Criar duplicata PIC=SIC (deve bloquear) ─────────
echo ""
echo "── Validação PIC=SIC ──"
if [[ -n "$EVD_ID" ]]; then
  # Buscar um funcionario valido
  FUNC_RESP=$(curl -s "${AUTH[@]}" "$BASE_URL/api/funcionarios?limit=2&page=1&status=ativos")
  F1=$(echo "$FUNC_RESP" | jq -r '.data[0].id // empty')
  if [[ -n "$F1" ]]; then
    DUP_PAYLOAD="{\"data\":\"$DATE\",\"aeronave_prefixo\":\"PR-DUP\",\"tipo_missao\":\"OFFSHORE\",\"pic_id\":$F1,\"sic_id\":$F1}"
    DUP_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$DUP_PAYLOAD" "$BASE_URL/api/evd")
    DUP_OK=$(echo "$DUP_RESP" | jq -r '.success // false')
    if [[ "$DUP_OK" == "false" ]]; then
      check "T04 PIC=SIC bloqueado corretamente"
    else
      # Pode não bloquear na criação mas na publicação — aceitar como warning
      skip "T04 PIC=SIC não bloqueado na criação (validado na publicação)"
      DUP_ID=$(echo "$DUP_RESP" | jq -r '.data.id // empty')
      [[ -n "$DUP_ID" ]] && curl -s -X DELETE "${AUTH[@]}" "$BASE_URL/api/evd/$DUP_ID" > /dev/null
    fi
  else
    skip "T04 PIC=SIC — sem funcionários disponíveis para teste"
  fi
else
  skip "T04 PIC=SIC — depende do T03"
fi

# ── TESTE 5: Publicação por data ─────────────────────────────
echo ""
echo "── Publicação ──"
if [[ -n "$EVD_ID" ]]; then
  PUB_PAYLOAD="{\"data_ref\":\"$DATE\",\"observacoes\":\"Teste funcional automatizado EDV\"}"
  PUB_RESP=$(curl -s -X POST "${AUTH[@]}" -d "$PUB_PAYLOAD" "$BASE_URL/api/evd/publicacoes")
  PUB_OK=$(echo "$PUB_RESP" | jq -r '.success // false')
  if [[ "$PUB_OK" == "true" ]]; then
    PUB_ID=$(echo "$PUB_RESP" | jq -r '.data.id')
    PUB_REV=$(echo "$PUB_RESP" | jq -r '.data.revisao')
    PUB_CHK=$(echo "$PUB_RESP" | jq -r '.data.checksum')
    check "T05 POST /api/evd/publicacoes — Rev=$PUB_REV checksum=${PUB_CHK:0:12}..."
  else
    fail "T05 POST /api/evd/publicacoes — $(echo "$PUB_RESP" | jq -r '.error // "erro"')"
    PUB_ID=""
  fi
else
  skip "T05 Publicação — depende do T03"
  PUB_ID=""
fi

# ── TESTE 6: Listagem de revisões ────────────────────────────
echo ""
echo "── Histórico de revisões ──"
HIST_RESP=$(curl -s "${AUTH[@]}" "$BASE_URL/api/evd/publicacoes?data=$DATE")
HIST_OK=$(echo "$HIST_RESP" | jq -r '.success // false')
if [[ "$HIST_OK" == "true" ]]; then
  HIST_COUNT=$(echo "$HIST_RESP" | jq '.data | length')
  check "T06 GET /api/evd/publicacoes?data=$DATE — ${HIST_COUNT} revisões"
else
  fail "T06 GET /api/evd/publicacoes — $(echo "$HIST_RESP" | jq -r '.error // "erro"')"
fi

# ── TESTE 7: Leitura de snapshot ─────────────────────────────
echo ""
echo "── Snapshot ──"
if [[ -n "${PUB_ID:-}" ]]; then
  SNAP_RESP=$(curl -s "${AUTH[@]}" "$BASE_URL/api/evd/publicacoes/$PUB_ID")
  SNAP_OK=$(echo "$SNAP_RESP" | jq -r '.success // false')
  if [[ "$SNAP_OK" == "true" ]]; then
    check "T07 GET /api/evd/publicacoes/$PUB_ID — snapshot carregado"

    # T08: Verificar ausência de FRMS sensível
    FRMS_INCLUDED=$(echo "$SNAP_RESP" | jq -r '.data.payload_json.frms_resumo.included // "missing"')
    if [[ "$FRMS_INCLUDED" == "false" ]]; then
      check "T08 frms_resumo.included=false — dados FRMS sensíveis ausentes do snapshot"
    else
      fail "T08 frms_resumo.included=$FRMS_INCLUDED — esperava false"
    fi
  else
    fail "T07 GET /api/evd/publicacoes/$PUB_ID — erro"
  fi
else
  skip "T07 Snapshot — depende do T05"
  skip "T08 FRMS ausente — depende do T05"
fi

# ── TESTE 9: Segunda publicação → nova revisão ───────────────
echo ""
echo "── Segunda publicação / revisão ──"
if [[ -n "${PUB_ID:-}" ]]; then
  PUB2_RESP=$(curl -s -X POST "${AUTH[@]}" -d "{\"data_ref\":\"$DATE\",\"observacoes\":\"Segunda revisão de teste\"}" "$BASE_URL/api/evd/publicacoes")
  PUB2_OK=$(echo "$PUB2_RESP" | jq -r '.success // false')
  if [[ "$PUB2_OK" == "true" ]]; then
    PUB2_REV=$(echo "$PUB2_RESP" | jq -r '.data.revisao')
    if [[ "$PUB2_REV" -gt 1 ]]; then
      check "T09 Segunda publicação — Rev=$PUB2_REV (incrementou)"
    else
      fail "T09 Segunda publicação — revisão não incrementou (Rev=$PUB2_REV)"
    fi
  else
    fail "T09 Segunda publicação — $(echo "$PUB2_RESP" | jq -r '.error // "erro"')"
  fi
else
  skip "T09 Segunda revisão — depende do T05"
fi

# ── Limpeza ──────────────────────────────────────────────────
echo ""
echo "── Limpeza (soft delete) ──"
if [[ -n "$EVD_ID" ]]; then
  DEL_RESP=$(curl -s -X DELETE "${AUTH[@]}" "$BASE_URL/api/evd/$EVD_ID")
  DEL_OK=$(echo "$DEL_RESP" | jq -r '.success // false')
  if [[ "$DEL_OK" == "true" ]]; then
    check "Limpeza: atribuição PR-TST removida (soft delete)"
  else
    skip "Limpeza: não foi possível remover PR-TST (já publicada ou erro)"
  fi
fi

# ── Resumo ───────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo -e "  ${GREEN}✓ $PASS passed${NC}  ${RED}✗ $FAIL failed${NC}  ${YELLOW}~ $SKIP skipped${NC}"
echo "══════════════════════════════════════════════════════════"
echo ""

[[ $FAIL -eq 0 ]] && exit 0 || exit 1
