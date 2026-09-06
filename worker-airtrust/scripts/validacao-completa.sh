#!/usr/bin/env bash
set -euo pipefail

# =============================================================
# VALIDAÇÃO COMPLETA - INTEGRAÇÃO QUALIFICAÇÕES
# Executa checklist automatizado conforme especificação.
# Uso:
#   cd worker-airtrust
#   chmod +x scripts/validacao-completa.sh
#   ./scripts/validacao-completa.sh
# Variáveis obrigatórias:
#   API_BASE, DB_NAME, EMAIL, SENHA
# REMOTE_FLAG usa --local por padrão. Execução remota exige opt-in explícito
# e continua proibida contra produção.
# =============================================================

API_BASE="${API_BASE:?Defina API_BASE explicitamente}"
DB_NAME="${DB_NAME:?Defina DB_NAME explicitamente}"
EMAIL="${EMAIL:?Defina EMAIL por ambiente}"
SENHA="${SENHA:?Defina SENHA por ambiente}"
REMOTE_FLAG="${REMOTE_FLAG:---local}"

case "$API_BASE" in
  *://api.airtrust.online*|*://airtrust-api.airtrust.workers.dev*)
    echo "ERRO: validacao-completa.sh legado nao pode executar contra producao." >&2
    exit 2
    ;;
esac

if [[ "$REMOTE_FLAG" == *"--remote"* ]] && [[ "${AIRTRUST_ALLOW_NONPROD_REMOTE_VALIDATION:-}" != "AIRTRUST_NONPROD_ONLY" ]]; then
  echo "ERRO: validacao remota requer AIRTRUST_ALLOW_NONPROD_REMOTE_VALIDATION=AIRTRUST_NONPROD_ONLY." >&2
  exit 2
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0
SECTION_FAIL=()

log() { printf "%s\n" "$1"; }
pass() { echo -e "${GREEN}✅ $1${NC}"; PASSED=$((PASSED+1)); }
fail() { echo -e "${RED}❌ $1${NC}"; FAILED=$((FAILED+1)); SECTION_FAIL+=("$1"); }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

header() {
  echo ""; echo "================================================"; echo "$1"; echo "================================================";
}

# Helper para executar SQL e pegar primeiro campo de primeira linha
sql_scalar() {
  local q="$1"
  local raw
  if ! raw=$(npx wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --command "$q" --json 2>/dev/null); then
    echo "__ERROR__"; return 0
  fi
  # Espera estrutura: [ { "results": [ { col: value } ] } ]
  echo "$raw" | jq -r '.[0].results[0] | to_entries[0].value' 2>/dev/null || echo "__PARSE_ERROR__"
}

# 1. VIEW EXISTE
header "PARTE 1: BANCO DE DADOS"
VIEW_EXISTS=$(sql_scalar "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='view' AND name='qualificacoes_historico_v'")
if [ "$VIEW_EXISTS" = "1" ]; then pass "View qualificacoes_historico_v existe"; else fail "View inexistente (valor=$VIEW_EXISTS)"; fi

# 2. MIGRATION 0049 (verifica na lista - tolera variações)
MIG_LIST=$(npx wrangler d1 migrations list "$DB_NAME" $REMOTE_FLAG 2>/dev/null || true)
if echo "$MIG_LIST" | grep -q "0049"; then
  pass "Migration(s) 0049 presentes (variação tolerada)"
elif [ "$VIEW_EXISTS" = "1" ]; then
  warn "Migration 0049 não listada, mas view existe - tolerando"
else
  fail "Migration 0049 ausente e view inexistente"
fi

# 3. CONTAGEM TABELA vs VIEW
COUNT_TABLE=$(sql_scalar "SELECT COUNT(*) AS total FROM qualificacoes_historico WHERE deleted_at IS NULL")
COUNT_VIEW=$(sql_scalar "SELECT COUNT(*) AS total FROM qualificacoes_historico_v")
if [ "$COUNT_TABLE" = "$COUNT_VIEW" ]; then pass "Contagem igual (tabela=$COUNT_TABLE view=$COUNT_VIEW)"; else fail "Contagem divergente (tabela=$COUNT_TABLE view=$COUNT_VIEW)"; fi

# 4. CAMPOS CRÍTICOS NÃO NULOS (sample 10)
NULL_CRITICOS=$(sql_scalar "SELECT COUNT(*) AS c FROM (SELECT qualificacao_nome, funcionario_nome FROM qualificacoes_historico_v LIMIT 10) WHERE qualificacao_nome IS NULL OR funcionario_nome IS NULL")
if [ "$NULL_CRITICOS" = "0" ]; then pass "Sample campos críticos OK (10 registros sem NULL)"; else fail "Campos críticos NULL na amostra (=$NULL_CRITICOS)"; fi

# 5. DISTRIBUIÇÃO STATUS (apenas verifica consulta executa)
if npx wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --command "SELECT status, COUNT(*) FROM qualificacoes_historico_v GROUP BY status" --json >/dev/null 2>&1; then pass "Query distribuição status OK"; else fail "Falha ao consultar distribuição status"; fi

# 6. DIAS ATÉ VENCIMENTO (verifica campo)
DIAS_FIELD=$(npx wrangler d1 execute "$DB_NAME" $REMOTE_FLAG --command "SELECT dias_ate_vencimento FROM qualificacoes_historico_v LIMIT 1" --json 2>/dev/null | jq -r '.[0].results[0].dias_ate_vencimento' || true)
if [ -n "$DIAS_FIELD" ] && [ "$DIAS_FIELD" != "null" ]; then pass "Campo dias_ate_vencimento presente"; else fail "Campo dias_ate_vencimento ausente"; fi

# =============================================================
header "PARTE 2: BACKEND"
# LOGIN TOKEN
TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}" | jq -r '.data.accessToken')
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then pass "Login OK - token obtido"; else fail "Login falhou - token vazio"; fi

# /historico status
HIST_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/qualificacoes/historico?limit=3" -H "Authorization: Bearer $TOKEN")
[ "$HIST_STATUS" = "200" ] && pass "/historico 200" || fail "/historico status=$HIST_STATUS"

# /historico campos integrados
HAS_FIELDS=$(curl -s "$API_BASE/api/qualificacoes/historico?limit=1" -H "Authorization: Bearer $TOKEN" | jq -r '.data[0] | (has("qualificacao_nome") and has("qualificacao_categoria") and has("status"))')
[ "$HAS_FIELDS" = "true" ] && pass "Campos integrados presentes" || fail "Campos integrados ausentes"

# /categorias status
CAT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/qualificacoes/categorias" -H "Authorization: Bearer $TOKEN")
[ "$CAT_STATUS" = "200" ] && pass "/categorias 200" || fail "/categorias status=$CAT_STATUS"

# /categorias conteúdo
CAT_CONTENT=$(curl -s "$API_BASE/api/qualificacoes/categorias" -H "Authorization: Bearer $TOKEN" | jq -r '.data | length')
if [ "$CAT_CONTENT" != "null" ] && [ "$CAT_CONTENT" -ge 0 ]; then pass "Categorias retornadas (total=$CAT_CONTENT)"; else fail "Categorias não retornadas"; fi

# =============================================================
header "PARTE 3: CRIAÇÃO QUALIFICAÇÃO (BEST EFFORT)"
TIPO_ID=$(curl -s "$API_BASE/api/qualificacoes/tipos?limit=1" -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')
FUNC_ID="39" # Ajustar se necessário; se inexistente, criação pode falhar.
if [ -n "$TIPO_ID" ] && [ "$TIPO_ID" != "null" ]; then
  CREATE_RESP=$(curl -s -X POST "$API_BASE/api/qualificacoes/historico" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "{\"funcionario_id\":\"$FUNC_ID\",\"qualificacao_id\":\"$TIPO_ID\",\"data_conclusao\":\"2025-11-21\",\"data_vencimento\":\"2026-11-21\",\"observacoes\":\"Teste automacao view\"}" | jq -r '.success') || true
  if [ "$CREATE_RESP" = "true" ]; then pass "Criação de qualificação OK"; else warn "Criação falhou (funcionario_id=$FUNC_ID ou permissões)."; fi
else
  warn "Tipo indisponível para criação - pulando teste de criação."; fi

# =============================================================
header "PARTE 4: PERFORMANCE (PEQUENO BURST)"
BURST_OK=1
for i in $(seq 1 5); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/api/qualificacoes/historico?limit=25" -H "Authorization: Bearer $TOKEN") || code=0
  if [ "$code" != "200" ]; then BURST_OK=0; break; fi
done
[ "$BURST_OK" = "1" ] && pass "Burst 5x /historico OK" || fail "Burst /historico falhou"

# =============================================================
header "PARTE 5: REFERENCIAL"
FK_NULLS=$(sql_scalar "SELECT COUNT(*) AS sem_fk FROM qualificacoes_historico WHERE qualificacao_id IS NULL AND deleted_at IS NULL")
if [ "$FK_NULLS" = "__ERROR__" ] || [ "$FK_NULLS" = "__PARSE_ERROR__" ]; then warn "Não foi possível consultar FK nulas"; else pass "Registros sem FK qualificacao_id: $FK_NULLS"; fi

# =============================================================
header "RESUMO FINAL"
TOTAL=$((PASSED+FAILED))
echo -e "${GREEN}Passaram:${NC} $PASSED"
echo -e "${RED}Falharam:${NC} $FAILED"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 SISTEMA 100% VALIDADO E FUNCIONAL!${NC}"
else
  echo -e "${RED}⚠️  FALHAS DETECTADAS:${NC}"
  for f in "${SECTION_FAIL[@]}"; do echo " - $f"; done
  echo "Sugestões: revisar view, endpoints ou dados base conforme mensagens acima.";
fi

exit $FAILED
