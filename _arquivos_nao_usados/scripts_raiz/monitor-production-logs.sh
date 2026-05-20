#!/bin/bash
# =============================================
# MONITORAMENTO DE LOGS DE PRODUÇÃO - AIRTRUST
# Data: 30/11/2025
# Descrição: Monitora logs do Workers em tempo real detectando erros
# =============================================

# NÃO usar set -u pois variáveis podem não estar definidas no pipe
set -eo pipefail

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Config
ENV="${ENV:-production}"
DURATION="${DURATION:-24}" # horas (INTEIRO apenas)

# Validar que DURATION é inteiro
if ! [[ "$DURATION" =~ ^[0-9]+$ ]]; then
  echo "Erro: DURATION deve ser um número inteiro (horas). Valor: $DURATION"
  exit 1
fi

REPORT_INTERVAL=21600 # 6 horas em segundos
REPORT_DIR="reports/monitoring"
START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION * 3600))

# Contadores
TOTAL_REQUESTS=0
ERRORS_500=0
ERRORS_404=0
ERRORS_AUTH=0
ERRORS_SQL=0
ERRORS_R2=0
ERRORS_TIMEOUT=0
WARNINGS=0

# Salvar diretório inicial
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Criar diretório
mkdir -p "$REPORT_DIR"

# Arquivo de log (caminho absoluto)
LOG_FILE="$SCRIPT_DIR/$REPORT_DIR/monitoring-$(date +%Y%m%d-%H%M).log"
SUMMARY_FILE="$SCRIPT_DIR/$REPORT_DIR/summary-$(date +%Y%m%d-%H%M).txt"

# Criar arquivos vazios para garantir que existem
: > "$LOG_FILE"
: > "$SUMMARY_FILE"

echo "🔍 MONITORAMENTO DE PRODUÇÃO - AIRTRUST" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "Ambiente: $ENV" | tee -a "$LOG_FILE"
echo "Duração: $DURATION horas" | tee -a "$LOG_FILE"
echo "Início: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$LOG_FILE"
echo "Fim previsto: $(date -r $END_TIME '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d @$END_TIME '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'N/A')" | tee -a "$LOG_FILE"
echo "Relatórios a cada: 6 horas" | tee -a "$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Função para categorizar log
categorize_log() {
  local line="$1"
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  
  # Contar request
  if echo "$line" | grep -qiE "GET|POST|PUT|DELETE|PATCH"; then
    TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
  fi
  
  # 🔴 CRÍTICO: Erro 500
  if echo "$line" | grep -qiE "500|Internal Server Error"; then
    ERRORS_500=$((ERRORS_500 + 1))
    echo -e "${RED}[CRÍTICO]${NC} [$timestamp] $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🔴 CRÍTICO: Exceção não tratada
  if echo "$line" | grep -qiE "Error:|Exception:|at .+:[0-9]+"; then
    ERRORS_500=$((ERRORS_500 + 1))
    echo -e "${RED}[CRÍTICO]${NC} [$timestamp] EXCEPTION: $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🔴 CRÍTICO: SQL Error
  if echo "$line" | grep -qiE "SQLITE_ERROR|SQL.*error|D1.*failed"; then
    ERRORS_SQL=$((ERRORS_SQL + 1))
    echo -e "${RED}[CRÍTICO]${NC} [$timestamp] SQL ERROR: $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🔴 CRÍTICO: R2 Error
  if echo "$line" | grep -qiE "R2.*failed|bucket.*error|upload.*failed"; then
    ERRORS_R2=$((ERRORS_R2 + 1))
    echo -e "${RED}[CRÍTICO]${NC} [$timestamp] R2 ERROR: $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🟡 AVISO: 404 em rota principal
  if echo "$line" | grep -qiE "404"; then
    # Ignorar 404 esperados (assets, favicon, etc)
    if echo "$line" | grep -qiE "favicon|assets|static"; then
      return
    fi
    ERRORS_404=$((ERRORS_404 + 1))
    echo -e "${YELLOW}[AVISO]${NC} [$timestamp] 404: $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🟡 AVISO: Auth failure
  if echo "$line" | grep -qiE "401|403|Unauthorized|Forbidden|Invalid token"; then
    ERRORS_AUTH=$((ERRORS_AUTH + 1))
    echo -e "${YELLOW}[AVISO]${NC} [$timestamp] AUTH: $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🟡 AVISO: Timeout
  if echo "$line" | grep -qiE "timeout|timed out|exceeded.*limit"; then
    ERRORS_TIMEOUT=$((ERRORS_TIMEOUT + 1))
    echo -e "${YELLOW}[AVISO]${NC} [$timestamp] TIMEOUT: $line" | tee -a "$LOG_FILE"
    return
  fi
  
  # 🟡 AVISO: Warning genérico
  if echo "$line" | grep -qiE "warn|warning"; then
    WARNINGS=$((WARNINGS + 1))
    echo -e "${YELLOW}[AVISO]${NC} [$timestamp] $line" >> "$LOG_FILE"
    return
  fi
  
  # 🔵 DEBUG: Informação de debug
  if echo "$line" | grep -qiE "DEBUG|debug"; then
    echo -e "${CYAN}[DEBUG]${NC} [$timestamp] $line" >> "$LOG_FILE"
    return
  fi
  
  # 🟢 INFO: Log normal (não mostrar no terminal, só salvar)
  echo "[INFO] [$timestamp] $line" >> "$LOG_FILE"
}

# Função para gerar relatório parcial
generate_report() {
  local report_num=$1
  local report_file="$REPORT_DIR/partial-report-$report_num-$(date +%Y%m%d-%H%M).txt"
  
  local elapsed=$(($(date +%s) - START_TIME))
  local elapsed_hours=$((elapsed / 3600))
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee "$report_file"
  echo "📊 RELATÓRIO PARCIAL #$report_num" | tee -a "$report_file"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$report_file"
  echo "" | tee -a "$report_file"
  echo "Período: Últimas ${elapsed_hours}h" | tee -a "$report_file"
  echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$report_file"
  echo "" | tee -a "$report_file"
  
  echo "📈 ESTATÍSTICAS:" | tee -a "$report_file"
  echo "  Total de requests: $TOTAL_REQUESTS" | tee -a "$report_file"
  
  if [ $TOTAL_REQUESTS -gt 0 ]; then
    local error_rate=$(awk "BEGIN {printf \"%.2f\", (($ERRORS_500 + $ERRORS_SQL + $ERRORS_R2) / $TOTAL_REQUESTS) * 100}")
    echo "  Taxa de erro: $error_rate%" | tee -a "$report_file"
    
    if (( $(echo "$error_rate > 1" | bc -l 2>/dev/null || echo 0) )); then
      echo -e "  ${RED}⚠️  ALERTA: Taxa de erro > 1%!${NC}" | tee -a "$report_file"
    fi
  fi
  
  echo "" | tee -a "$report_file"
  echo "🔴 ERROS CRÍTICOS:" | tee -a "$report_file"
  echo "  Erros 500: $ERRORS_500" | tee -a "$report_file"
  echo "  Erros SQL: $ERRORS_SQL" | tee -a "$report_file"
  echo "  Erros R2: $ERRORS_R2" | tee -a "$report_file"
  echo "  Timeouts: $ERRORS_TIMEOUT" | tee -a "$report_file"
  echo "" | tee -a "$report_file"
  
  echo "🟡 AVISOS:" | tee -a "$report_file"
  echo "  Erros 404: $ERRORS_404" | tee -a "$report_file"
  echo "  Falhas Auth: $ERRORS_AUTH" | tee -a "$report_file"
  echo "  Warnings: $WARNINGS" | tee -a "$report_file"
  echo "" | tee -a "$report_file"
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$report_file"
  echo "" | tee -a "$report_file"
  
  echo "Relatório parcial salvo: $report_file"
}

# Função para gerar relatório final
generate_final_report() {
  local end_timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  
  echo "" | tee "$SUMMARY_FILE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$SUMMARY_FILE"
  echo "📊 RELATÓRIO FINAL - MONITORAMENTO" | tee -a "$SUMMARY_FILE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$SUMMARY_FILE"
  echo "" | tee -a "$SUMMARY_FILE"
  
  echo "⏱️  PERÍODO:" | tee -a "$SUMMARY_FILE"
  echo "  Início: $(date -r $START_TIME '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d @$START_TIME '+%Y-%m-%d %H:%M:%S' 2>/dev/null)" | tee -a "$SUMMARY_FILE"
  echo "  Fim: $end_timestamp" | tee -a "$SUMMARY_FILE"
  local actual_duration=$(( ($(date +%s) - START_TIME) / 3600 ))
  echo "  Duração: ${actual_duration}h (planejado: ${DURATION}h)" | tee -a "$SUMMARY_FILE"
  echo "" | tee -a "$SUMMARY_FILE"
  
  echo "📈 ESTATÍSTICAS GERAIS:" | tee -a "$SUMMARY_FILE"
  echo "  Total de requests: $TOTAL_REQUESTS" | tee -a "$SUMMARY_FILE"
  
  if [ $TOTAL_REQUESTS -gt 0 ]; then
    local requests_per_hour=$((TOTAL_REQUESTS / (actual_duration > 0 ? actual_duration : 1)))
    echo "  Requests/hora: ~$requests_per_hour" | tee -a "$SUMMARY_FILE"
    
    local total_errors=$((ERRORS_500 + ERRORS_SQL + ERRORS_R2 + ERRORS_TIMEOUT))
    local error_rate=$(awk "BEGIN {printf \"%.3f\", ($total_errors / $TOTAL_REQUESTS) * 100}")
    echo "  Taxa de erro: $error_rate%" | tee -a "$SUMMARY_FILE"
    
    if (( $(echo "$error_rate > 1" | bc -l 2>/dev/null || echo 0) )); then
      echo -e "  ${RED}❌ CRÍTICO: Taxa de erro > 1%${NC}" | tee -a "$SUMMARY_FILE"
    elif (( $(echo "$error_rate > 0.5" | bc -l 2>/dev/null || echo 0) )); then
      echo -e "  ${YELLOW}⚠️  AVISO: Taxa de erro > 0.5%${NC}" | tee -a "$SUMMARY_FILE"
    else
      echo -e "  ${GREEN}✅ Taxa de erro aceitável (<0.5%)${NC}" | tee -a "$SUMMARY_FILE"
    fi
  else
    echo "  ⚠️  Nenhuma request detectada!" | tee -a "$SUMMARY_FILE"
  fi
  
  echo "" | tee -a "$SUMMARY_FILE"
  echo "🔴 ERROS CRÍTICOS (Total: $((ERRORS_500 + ERRORS_SQL + ERRORS_R2 + ERRORS_TIMEOUT))):" | tee -a "$SUMMARY_FILE"
  echo "  Erros 500: $ERRORS_500" | tee -a "$SUMMARY_FILE"
  echo "  Erros SQL: $ERRORS_SQL" | tee -a "$SUMMARY_FILE"
  echo "  Erros R2: $ERRORS_R2" | tee -a "$SUMMARY_FILE"
  echo "  Timeouts: $ERRORS_TIMEOUT" | tee -a "$SUMMARY_FILE"
  echo "" | tee -a "$SUMMARY_FILE"
  
  echo "🟡 AVISOS (Total: $((ERRORS_404 + ERRORS_AUTH + WARNINGS))):" | tee -a "$SUMMARY_FILE"
  echo "  Erros 404: $ERRORS_404" | tee -a "$SUMMARY_FILE"
  echo "  Falhas Auth: $ERRORS_AUTH" | tee -a "$SUMMARY_FILE"
  echo "  Warnings: $WARNINGS" | tee -a "$SUMMARY_FILE"
  echo "" | tee -a "$SUMMARY_FILE"
  
  # Top 5 erros mais frequentes
  if [ -f "$LOG_FILE" ]; then
    echo "🔥 TOP 5 ERROS MAIS FREQUENTES:" | tee -a "$SUMMARY_FILE"
    if grep -qE "\[CRÍTICO\]|\[AVISO\]" "$LOG_FILE" 2>/dev/null; then
      grep -E "\[CRÍTICO\]|\[AVISO\]" "$LOG_FILE" | \
        sed 's/\[.*\] \[.*\] //' | \
        sort | uniq -c | sort -rn | head -5 | \
        awk '{print "  " $1 "x - " substr($0, index($0,$2))}' | tee -a "$SUMMARY_FILE"
    else
      echo "  Nenhum erro frequente detectado ✅" | tee -a "$SUMMARY_FILE"
    fi
    echo "" | tee -a "$SUMMARY_FILE"
  fi
  
  # Recomendações
  echo "💡 RECOMENDAÇÕES:" | tee -a "$SUMMARY_FILE"
  
  if [ $ERRORS_500 -gt 0 ]; then
    echo "  🔴 Investigar erros 500 (revisar stack traces no log completo)" | tee -a "$SUMMARY_FILE"
  fi
  
  if [ $ERRORS_SQL -gt 0 ]; then
    echo "  🔴 Otimizar queries SQL (ver queries falhando no log)" | tee -a "$SUMMARY_FILE"
  fi
  
  if [ $ERRORS_R2 -gt 0 ]; then
    echo "  🔴 Verificar conectividade R2 e quotas" | tee -a "$SUMMARY_FILE"
  fi
  
  if [ $ERRORS_404 -gt 10 ]; then
    echo "  🟡 Revisar rotas 404 (podem ser links quebrados no frontend)" | tee -a "$SUMMARY_FILE"
  fi
  
  if [ $ERRORS_AUTH -gt 50 ]; then
    echo "  🟡 Investigar falhas de autenticação excessivas" | tee -a "$SUMMARY_FILE"
  fi
  
  if [ $ERRORS_500 -eq 0 ] && [ $ERRORS_SQL -eq 0 ] && [ $ERRORS_R2 -eq 0 ]; then
    echo "  ✅ Sistema estável! Nenhum erro crítico detectado." | tee -a "$SUMMARY_FILE"
  fi
  
  echo "" | tee -a "$SUMMARY_FILE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$SUMMARY_FILE"
  echo "" | tee -a "$SUMMARY_FILE"
  
  echo "📁 ARQUIVOS GERADOS:" | tee -a "$SUMMARY_FILE"
  echo "  Logs completos: $LOG_FILE" | tee -a "$SUMMARY_FILE"
  echo "  Relatório final: $SUMMARY_FILE" | tee -a "$SUMMARY_FILE"
  echo "" | tee -a "$SUMMARY_FILE"
}

# Trap para cleanup
cleanup() {
  echo ""
  echo "Encerrando monitoramento..."
  generate_final_report
  echo "Monitoramento concluído!"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Loop principal
echo "Iniciando monitoramento (pressione Ctrl+C para parar)..."
echo ""

report_counter=0
last_report_time=$START_TIME

# Verificar se wrangler está disponível
if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}Erro: wrangler não encontrado. Instale com: npm install -g wrangler${NC}"
  exit 1
fi

# Iniciar tail
cd "$(dirname "$0")/worker-airtrust" 2>/dev/null || cd "$(dirname "$0")"

wrangler tail --env "$ENV" 2>&1 | while IFS= read -r line; do
  # Verificar se já passou o tempo
  current_time=$(date +%s)
  if [ $current_time -ge $END_TIME ]; then
    echo "Duração de $DURATION horas atingida. Finalizando..."
    break
  fi
  
  # Processar linha
  categorize_log "$line"
  
  # Gerar relatório parcial a cada 6h
  if [ $((current_time - last_report_time)) -ge $REPORT_INTERVAL ]; then
    report_counter=$((report_counter + 1))
    echo ""
    generate_report $report_counter
    echo ""
    last_report_time=$current_time
  fi
done

# Relatório final (executado automaticamente por EXIT trap)
