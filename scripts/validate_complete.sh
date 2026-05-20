#!/bin/bash
# =============================================================
# SCRIPT DE VALIDAÇÃO COMPLETA SSOT AIRTRUST
# Verifica recuperação de dados, integridade referencial,
# reatividade (propagação em view) e soft delete cascade.
# =============================================================
# Uso:
#   chmod +x scripts/validate_complete.sh
#   scripts/validate_complete.sh
# Log: validation_YYYYMMDD_HHMMSS.log
# Requisitos: wrangler, jq
# =============================================================
set -euo pipefail

DB_NAME="airtrust-db"
ALLOW_MUTATIONS="${ALLOW_MUTATIONS:-0}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="validation_${TIMESTAMP}.log"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}" | tee -a "$LOG_FILE"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')] ℹ️  $1${NC}" | tee -a "$LOG_FILE"; }
success() { echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}" | tee -a "$LOG_FILE"; }

# Função utilitária para extrair último número de saída tabular wrangler
extract_last_number() {
  # Filtra linhas com apenas dígitos ou na coluna de tabela
  grep -Eo '[0-9]+' | tail -1 || echo 0
}

log "=========================================="
log "FASE 1: VERIFICAÇÃO DE DADOS RECUPERADOS"
log "=========================================="

info "Teste 1.1: Contando registros em qualificacoes_historico..."
TOTAL_HISTORICO=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) as count FROM qualificacoes_historico WHERE deleted_at IS NULL;" 2>>"$LOG_FILE" | extract_last_number)

if [ "${TOTAL_HISTORICO:-0}" -gt 0 ]; then
  success "Total de registros: $TOTAL_HISTORICO"
else
  error "ZERO registros encontrados! Recuperação falhou."; exit 1
fi

info "Teste 1.2: Contando registros visíveis na view..."
TOTAL_VIEW=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) as count FROM qualificacoes_historico_v;" 2>>"$LOG_FILE" | extract_last_number)

if [ "$TOTAL_VIEW" -eq "$TOTAL_HISTORICO" ]; then
  success "View mostrando todos os registros: $TOTAL_VIEW"
elif [ "$TOTAL_VIEW" -gt 0 ]; then
  warn "View mostrando $TOTAL_VIEW de $TOTAL_HISTORICO (possíveis órfãos)"
else
  error "ZERO registros na view!"; exit 1
fi

info "Teste 1.3: Verificando preservação de datas..."
TOTAL_COM_DATAS=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) as count FROM qualificacoes_historico WHERE validade IS NOT NULL AND deleted_at IS NULL;" 2>>"$LOG_FILE" | extract_last_number)
TAXA_DATAS=$(( TOTAL_COM_DATAS * 100 / TOTAL_HISTORICO ))
if [ "$TAXA_DATAS" -gt 80 ]; then
  success "Datas preservadas: $TOTAL_COM_DATAS ($TAXA_DATAS%)"
else
  warn "Apenas $TAXA_DATAS% dos registros têm datas válidas"
fi

info "Teste 1.4: Distribuição por status de validade..."
wrangler d1 execute "$DB_NAME" --remote --command "SELECT status, COUNT(*) as total, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM qualificacoes_historico_v), 1) as porcentagem FROM qualificacoes_historico_v GROUP BY status ORDER BY total DESC;" | tee -a "$LOG_FILE"

info "Teste 1.5: Funcionários / Tipos únicos..."
RESULT=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(DISTINCT funcionario_id) as funcionarios_unicos, COUNT(DISTINCT qualificacao_id) as tipos_unicos FROM qualificacoes_historico WHERE deleted_at IS NULL;" 2>>"$LOG_FILE")
FUNC_UNICOS=$(echo "$RESULT" | grep -Eo '[0-9]+' | head -1 || echo 0)
TIPOS_UNICOS=$(echo "$RESULT" | grep -Eo '[0-9]+' | tail -1 || echo 0)
success "Funcionários únicos: $FUNC_UNICOS"
success "Tipos únicos: $TIPOS_UNICOS"

log "\n=========================================="
log "FASE 2: VERIFICAÇÃO DE FOREIGN KEYS"
log "=========================================="

info "Teste 2.1: Verificando Foreign Keys..."
FK_COUNT=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) as count FROM pragma_foreign_key_list('qualificacoes_historico');" 2>>"$LOG_FILE" | extract_last_number)
if [ "$FK_COUNT" -ge 2 ]; then
  success "Foreign Keys detectadas: $FK_COUNT"
else
  warn "Foreign Keys insuficientes: $FK_COUNT"
fi

info "Teste 2.2: Detalhes FKs..."
wrangler d1 execute "$DB_NAME" --remote --command "SELECT \"from\" as coluna, \"table\" as tabela_referenciada, on_update, on_delete FROM pragma_foreign_key_list('qualificacoes_historico');" | tee -a "$LOG_FILE"

info "Teste 2.3: Verificando órfãos..."
ORFAOS_FUNC=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) as count FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = qh.funcionario_id AND f.deleted_at IS NULL);" 2>>"$LOG_FILE" | extract_last_number)
ORFAOS_TIPO=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT COUNT(*) as count FROM qualificacoes_historico qh WHERE qh.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL);" 2>>"$LOG_FILE" | extract_last_number)
if [ "$ORFAOS_FUNC" -eq 0 ] && [ "$ORFAOS_TIPO" -eq 0 ]; then
  success "Sem órfãos (funcionários / tipos)."
else
  warn "Órfãos encontrados: Funcionários=$ORFAOS_FUNC Tipos=$ORFAOS_TIPO"
fi

log "\n=========================================="
log "FASE 3: TESTES DE REATIVIDADE"
log "=========================================="

if [ "$ALLOW_MUTATIONS" = "1" ]; then
  info "Teste 3.1: Selecionando funcionário de teste..."
  FUNC_TEST_ID=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT funcionario_id as id FROM qualificacoes_historico_v WHERE funcionario_id IS NOT NULL LIMIT 1;" | grep -Eo '[0-9]+' | head -1 || true)
  if [ -z "${FUNC_TEST_ID}" ]; then error "Nenhum funcionário disponível"; exit 1; fi
  info "Funcionário escolhido: $FUNC_TEST_ID"

  NOME_ORIGINAL=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT nome FROM funcionarios WHERE id = $FUNC_TEST_ID;" | tail -1 | xargs || echo "DESCONHECIDO")
  info "Nome original: $NOME_ORIGINAL"

  info "Teste 3.2: UPDATE funcionário propagando em view..."
  wrangler d1 execute "$DB_NAME" --remote --command "UPDATE funcionarios SET nome = '$NOME_ORIGINAL (TESTE REATIVIDADE)', updated_at = datetime('now') WHERE id = $FUNC_TEST_ID;" >/dev/null 2>&1
  NOME_VIEW=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT funcionario_nome FROM qualificacoes_historico_v WHERE funcionario_id = $FUNC_TEST_ID LIMIT 1;" | tail -1 | xargs || true)
  if [[ "$NOME_VIEW" == *"TESTE REATIVIDADE"* ]]; then success "Reatividade OK (funcionário)"; else error "Falha reatividade funcionário"; fi
  # Reverte
  wrangler d1 execute "$DB_NAME" --remote --command "UPDATE funcionarios SET nome = '$NOME_ORIGINAL', updated_at = datetime('now') WHERE id = $FUNC_TEST_ID;" >/dev/null 2>&1

  info "Teste 3.3: UPDATE tipo qualificação propagando..."
  TIPO_TEST_ID=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT qualificacao_id as id FROM qualificacoes_historico_v WHERE qualificacao_id IS NOT NULL LIMIT 1;" | grep -Eo '[0-9]+' | head -1 || true)
  TIPO_NOME_ORIGINAL=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT nome FROM qualificacoes_tipos WHERE id = $TIPO_TEST_ID;" | tail -1 | xargs || echo "TIPO_DESCONHECIDO")
  wrangler d1 execute "$DB_NAME" --remote --command "UPDATE qualificacoes_tipos SET nome = '$TIPO_NOME_ORIGINAL (TESTE REATIVIDADE)', updated_at = datetime('now') WHERE id = $TIPO_TEST_ID;" >/dev/null 2>&1
  TIPO_NOME_VIEW=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT qualificacao_nome FROM qualificacoes_historico_v WHERE qualificacao_id = $TIPO_TEST_ID LIMIT 1;" | tail -1 | xargs || true)
  if [[ "$TIPO_NOME_VIEW" == *"TESTE REATIVIDADE"* ]]; then success "Reatividade OK (tipo)"; else error "Falha reatividade tipo"; fi
  # Reverte
  wrangler d1 execute "$DB_NAME" --remote --command "UPDATE qualificacoes_tipos SET nome = '$TIPO_NOME_ORIGINAL', updated_at = datetime('now') WHERE id = $TIPO_TEST_ID;" >/dev/null 2>&1
else
  warn "FASE 3 pulada (read-only). Defina ALLOW_MUTATIONS=1 para executar testes com UPDATE."
  NOME_VIEW="N/A"
  TIPO_NOME_VIEW="N/A"
fi

log "\n=========================================="
log "FASE 4: SOFT DELETE CASCADE"
log "=========================================="

if [ "$ALLOW_MUTATIONS" = "1" ]; then
  info "Criando funcionário e histórico temporários..."
  TEMP_FUNC_ID=$(wrangler d1 execute "$DB_NAME" --remote --command "INSERT INTO funcionarios (nome, email, status) VALUES ('TESTE DELETE CASCADE', 'teste_delete@temp.com', 'ATIVO') RETURNING id;" | grep -Eo '[0-9]+' | tail -1 || true)
  TEMP_TIPO_ID=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT id FROM qualificacoes_tipos WHERE deleted_at IS NULL LIMIT 1;" | grep -Eo '[0-9]+' | head -1 || true)
  TEMP_HIST_ID=$(wrangler d1 execute "$DB_NAME" --remote --command "INSERT INTO qualificacoes_historico (funcionario_id, qualificacao_id, validade, numero_certificado) VALUES ($TEMP_FUNC_ID, $TEMP_TIPO_ID, datetime('now','+1 year'), 'TESTE-DELETE-001') RETURNING id;" | grep -Eo '[0-9]+' | tail -1 || true)
  info "Criados: funcionario=$TEMP_FUNC_ID historico=$TEMP_HIST_ID"

  wrangler d1 execute "$DB_NAME" --remote --command "UPDATE funcionarios SET deleted_at = datetime('now') WHERE id = $TEMP_FUNC_ID;" >/dev/null 2>&1
  HIST_DELETED=$(wrangler d1 execute "$DB_NAME" --remote --command "SELECT deleted_at FROM qualificacoes_historico WHERE id = $TEMP_HIST_ID;" | tail -1 | xargs || echo NULL)
  if [ "$HIST_DELETED" != "NULL" ] && [ -n "$HIST_DELETED" ]; then success "Cascade OK (qualificações)"; else warn "Cascade NÃO propagou para histórico (verificar lógica)."; fi
  # Limpa
  wrangler d1 execute "$DB_NAME" --remote --command "DELETE FROM qualificacoes_historico WHERE id = $TEMP_HIST_ID; DELETE FROM funcionarios WHERE id = $TEMP_FUNC_ID;" >/dev/null 2>&1
else
  warn "FASE 4 pulada (read-only). Defina ALLOW_MUTATIONS=1 para executar testes de cascade com INSERT/UPDATE."
fi

log "\n=========================================="
log "FASE 5: ENDPOINT API"
log "=========================================="
WORKER_URL="https://airtrust-api-production.airtrust.workers.dev"
info "Testando /api/health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/api/health" || echo 000)
if [ "$HTTP_CODE" -eq 200 ]; then success "Health OK"; else warn "Health falhou HTTP $HTTP_CODE"; fi

info "Testando /api/qualificacoes/historico?limit=5..."
RESPONSE=$(curl -s "$WORKER_URL/api/qualificacoes/historico?limit=5")
API_COUNT=$(echo "$RESPONSE" | jq -r '.data | length' 2>/dev/null || echo 0)
if [ "$API_COUNT" -gt 0 ]; then success "API retornou $API_COUNT registros"; else warn "API retornou 0 ou erro"; echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"; fi

log "\n=========================================="
log "RELATÓRIO FINAL"
log "=========================================="
wrangler d1 execute "$DB_NAME" --remote --command "SELECT 'Total' as metrica, COUNT(*) as valor FROM qualificacoes_historico WHERE deleted_at IS NULL UNION ALL SELECT 'View', COUNT(*) FROM qualificacoes_historico_v UNION ALL SELECT 'Com Datas', COUNT(*) FROM qualificacoes_historico WHERE validade IS NOT NULL AND deleted_at IS NULL;" | tee -a "$LOG_FILE"

log "\nChecklist:" | tee -a "$LOG_FILE"
log "- Registros > 0" | tee -a "$LOG_FILE"
log "- View = Tabela ($TOTAL_VIEW vs $TOTAL_HISTORICO)" | tee -a "$LOG_FILE"
log "- Datas >= 80% ($TAXA_DATAS%)" | tee -a "$LOG_FILE"
log "- FKs >= 2 ($FK_COUNT)" | tee -a "$LOG_FILE"
log "- Órfãos Funcionários: $ORFAOS_FUNC" | tee -a "$LOG_FILE"
log "- Órfãos Tipos: $ORFAOS_TIPO" | tee -a "$LOG_FILE"
log "- Reatividade funcionário: $([[ "$NOME_VIEW" == *"TESTE REATIVIDADE"* ]] && echo OK || echo VERIFICAR)" | tee -a "$LOG_FILE"
log "- Reatividade tipo: $([[ "$TIPO_NOME_VIEW" == *"TESTE REATIVIDADE"* ]] && echo OK || echo VERIFICAR)" | tee -a "$LOG_FILE"
log "- Soft delete cascade: (qualificações)" | tee -a "$LOG_FILE"
log "- API histórico: $API_COUNT itens" | tee -a "$LOG_FILE"

success "Validação concluída. Log salvo em $LOG_FILE"
log "Próximos passos: revisar log e executar materialização avançada se necessário."
