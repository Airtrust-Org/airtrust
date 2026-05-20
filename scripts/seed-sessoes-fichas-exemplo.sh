#!/usr/bin/env bash
set -euo pipefail

# Cria uma sessão de simulador com participantes e gera uma ficha com 22 manobras
# Uso: bash scripts/seed-sessoes-fichas-exemplo.sh

API="http://localhost:8787/api"
WRANGLER_CFG="--config wrangler.dev.toml"
DB_NAME="airtrust-db-dev"

log() { echo -e "\033[1;34m[seed]\033[0m $*"; }
err() { echo -e "\033[0;31m[seed-error]\033[0m $*" >&2; }

# 1) Login e obter token
log "Autenticando..."
TOKEN=$(curl -sS -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@airtrust.com","senha":"Admin@123"}' | jq -r '.data.accessToken')
if [ -z "${TOKEN:-}" ] || [ "$TOKEN" = "null" ]; then
  err "Falha ao autenticar. Verifique o backend dev (npm run dev:worker)."; exit 1; fi

AUTH=(-H "Authorization: Bearer $TOKEN")

# 2) Garantir templates de manobras para tipo_aeronave = 'FFN' (22 itens)
log "Garantindo templates cadastro_manobras para TREINAMENTO/FFN (22 entradas)..."
SQL="\
INSERT OR IGNORE INTO cadastro_manobras (tipo_sessao, tipo_aeronave, codigo, descricao, categoria, ordem) VALUES
  ('TREINAMENTO','FFN','M01','Briefing & Setup','GERAL',1),
  ('TREINAMENTO','FFN','M02','Engine Start','GERAL',2),
  ('TREINAMENTO','FFN','M03','Taxi & Checklist','GERAL',3),
  ('TREINAMENTO','FFN','M04','Takeoff','DECOLAGEM',4),
  ('TREINAMENTO','FFN','M05','Initial Climb','SUBIDA',5),
  ('TREINAMENTO','FFN','M06','Climb & Cruise','CRUZEIRO',6),
  ('TREINAMENTO','FFN','M07','Descent Planning','DESCIDA',7),
  ('TREINAMENTO','FFN','M08','Approach Briefing','APROXIMACAO',8),
  ('TREINAMENTO','FFN','M09','Approach','APROXIMACAO',9),
  ('TREINAMENTO','FFN','M10','Landing','POUSO',10),
  ('TREINAMENTO','FFN','M11','Go-Around','APROXIMACAO',11),
  ('TREINAMENTO','FFN','M12','Single-Engine Procedures','EMERGENCIA',12),
  ('TREINAMENTO','FFN','M13','Non-normal Checklist','EMERGENCIA',13),
  ('TREINAMENTO','FFN','M14','Stall Recovery','EMERGENCIA',14),
  ('TREINAMENTO','FFN','M15','Unusual Attitudes','EMERGENCIA',15),
  ('TREINAMENTO','FFN','M16','Navigation & FMC','SISTEMAS',16),
  ('TREINAMENTO','FFN','M17','Communication','GERAL',17),
  ('TREINAMENTO','FFN','M18','Autopilot Use','SISTEMAS',18),
  ('TREINAMENTO','FFN','M19','Manual Flight','GERAL',19),
  ('TREINAMENTO','FFN','M20','CRM & Leadership','GERAL',20),
  ('TREINAMENTO','FFN','M21','Abnormal Smoke/Fire','EMERGENCIA',21),
  ('TREINAMENTO','FFN','M22','Evacuation Procedures','EMERGENCIA',22);\
"
wrangler d1 execute $WRANGLER_CFG "$DB_NAME" --local --command "$SQL" >/dev/null 2>&1 || true

# 3) Obter IDs de simulador e funcionários
SIM_ID=$(curl -sS "$API/simuladores" | jq -r '.data[0].id // empty')
if [ -z "$SIM_ID" ]; then err "Nenhum simulador encontrado. Crie um em /api/simuladores."; exit 1; fi
ALUNO_ID=$(curl -sS "${API}/funcionarios?limit=5" "${AUTH[@]}" | jq -r '.data[] | select(.funcao=="PILOTO" or .cargo=="Piloto") | .id' | head -1)
[ -z "$ALUNO_ID" ] && ALUNO_ID=$(curl -sS "${API}/funcionarios?limit=5" "${AUTH[@]}" | jq -r '.data[0].id')
INSTRUTOR_ID=$(curl -sS "${API}/funcionarios?limit=5" "${AUTH[@]}" | jq -r '.data[] | select(.funcao=="INSTRUTOR" or .cargo=="Instrutor") | .id' | head -1)
[ -z "$INSTRUTOR_ID" ] && INSTRUTOR_ID=$ALUNO_ID

log "SIM=$SIM_ID ALUNO=$ALUNO_ID INSTRUTOR=$INSTRUTOR_ID"

# 4) Criar sessão CONFIRMADA com os participantes
NOW=$(date '+%Y-%m-%dT%H:%M:%S')
log "Criando sessão..."
SESSAO_ID=$(curl -sS -X POST "$API/simuladores/sessoes" -H 'Content-Type: application/json' "${AUTH[@]}" \
  -d "{\"sessao\":{\"simulador_id\":$SIM_ID,\"tipo_sessao\":\"TREINAMENTO\",\"data_sessao\":\"$NOW\",\"status\":\"CONFIRMADA\"},\"participantes\":[{\"funcionario_id\":$ALUNO_ID,\"papel\":\"ALUNO\"},{\"funcionario_id\":$INSTRUTOR_ID,\"papel\":\"INSTRUTOR\"}]}" | jq -r '.data.id')
if [ -z "$SESSAO_ID" ] || [ "$SESSAO_ID" = "null" ]; then err "Falha ao criar sessão."; exit 1; fi
log "Sessão criada: $SESSAO_ID"

# 5) Obter ficha criada automaticamente
FICHA_ID=$(curl -sS "${API}/simuladores/fichas?limit=5" | jq -r '.data[0].id // empty')
if [ -z "$FICHA_ID" ]; then
  # fallback: criar manualmente
  FICHA_ID=$(curl -sS -X POST "$API/simuladores/fichas" -H 'Content-Type: application/json' "${AUTH[@]}" \
    -d "{\"sessao_id\":$SESSAO_ID,\"funcionario_id\":$ALUNO_ID,\"instrutor_id\":$INSTRUTOR_ID}" | jq -r '.data.id')
fi
log "Ficha: $FICHA_ID"

# 6) Garantir manobras na ficha (22)
curl -sS -X POST "$API/simuladores/fichas-simulador/$FICHA_ID/popular-manobras" "${AUTH[@]}" >/dev/null

# 7) Preencher resultados (0..10) para 6 primeiras manobras
MANOBRAS=$(curl -sS "${API}/simuladores/fichas-simulador?ficha_id=$FICHA_ID" | jq -c '.data.manobras | .[0:6] | map({id: .id, resultado: (tostring | length)})')
if [ -n "$MANOBRAS" ] && [ "$MANOBRAS" != "null" ]; then
  curl -sS -X PUT "$API/simuladores/fichas-simulador/$FICHA_ID/manobras" -H 'Content-Type: application/json' "${AUTH[@]}" -d "$MANOBRAS" >/dev/null
fi

# 8) Aprovar ficha e assinar aluno + instrutor
curl -sS -X PUT "$API/simuladores/fichas/$FICHA_ID" -H 'Content-Type: application/json' "${AUTH[@]}" \
  -d '{"nota_geral":"APROVADO","comentarios_gerais":"Seed local"}' >/dev/null
curl -sS -X POST "$API/simuladores/fichas-simulador/$FICHA_ID/assinar" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"papel":"ALUNO","info":"seed"}' >/dev/null
curl -sS -X POST "$API/simuladores/fichas-simulador/$FICHA_ID/assinar" -H 'Content-Type: application/json' "${AUTH[@]}" -d '{"papel":"INSTRUTOR","info":"seed"}' >/dev/null

log "Concluído: sessão $SESSAO_ID, ficha $FICHA_ID (manobras populadas)."
