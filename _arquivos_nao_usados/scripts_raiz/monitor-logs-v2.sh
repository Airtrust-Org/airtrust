#!/bin/bash
# =============================================
# MONITORAMENTO DE LOGS DE PRODUÇÃO - AIRTRUST V2
# Data: 30/11/2025
# Versão simplificada e funcional
# =============================================

set -eo pipefail

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Config
ENV="${ENV:-production}"
DURATION="${DURATION:-24}"

# Validar DURATION
if ! [[ "$DURATION" =~ ^[0-9]+$ ]]; then
  echo -e "${RED}Erro: DURATION deve ser inteiro. Valor: $DURATION${NC}"
  exit 1
fi

# Diretórios
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/reports/monitoring"
mkdir -p "$REPORT_DIR"

# Arquivos
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RAW_LOG="$REPORT_DIR/raw-$TIMESTAMP.log"
SUMMARY="$REPORT_DIR/summary-$TIMESTAMP.txt"

# Contadores (usando arquivo para persistir entre processos)
COUNT_FILE="/tmp/monitor-counts-$$.txt"
: > "$COUNT_FILE"

# Inicializar contadores
echo "TOTAL_REQUESTS=0" >> "$COUNT_FILE"
echo "ERRORS_500=0" >> "$COUNT_FILE"
echo "ERRORS_404=0" >> "$COUNT_FILE"
echo "ERRORS_SQL=0" >> "$COUNT_FILE"
echo "ERRORS_R2=0" >> "$COUNT_FILE"

# Banner
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee "$SUMMARY"
echo "🔍 MONITORAMENTO - AIRTRUST" | tee -a "$SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"
echo "Ambiente: $ENV" | tee -a "$SUMMARY"
echo "Duração: $DURATION horas" | tee -a "$SUMMARY"
echo "Início: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$SUMMARY"
echo "" | tee -a "$SUMMARY"

# Função para incrementar contador
increment_counter() {
  local counter=$1
  local current=$(grep "^$counter=" "$COUNT_FILE" | cut -d= -f2)
  local new=$((current + 1))
  sed -i.bak "s/^$counter=.*/$counter=$new/" "$COUNT_FILE"
  rm -f "$COUNT_FILE.bak"
}

# Função para ler contador
read_counter() {
  local counter=$1
  grep "^$counter=" "$COUNT_FILE" | cut -d= -f2
}

# Cleanup
cleanup() {
  echo ""
  echo "Encerrando monitoramento..."
  
  # Matar wrangler se estiver rodando
  if [ -n "${WRANGLER_PID:-}" ] && ps -p "$WRANGLER_PID" > /dev/null 2>&1; then
    kill "$WRANGLER_PID" 2>/dev/null || true
  fi
  
  # Gerar relatório final
  echo "" | tee -a "$SUMMARY"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$SUMMARY"
  echo "📊 RELATÓRIO FINAL" | tee -a "$SUMMARY"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$SUMMARY"
  echo "" | tee -a "$SUMMARY"
  echo "Fim: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "$SUMMARY"
  echo "" | tee -a "$SUMMARY"
  
  # Estatísticas
  local total=$(read_counter "TOTAL_REQUESTS")
  local e500=$(read_counter "ERRORS_500")
  local e404=$(read_counter "ERRORS_404")
  local esql=$(read_counter "ERRORS_SQL")
  local er2=$(read_counter "ERRORS_R2")
  
  echo "📈 ESTATÍSTICAS:" | tee -a "$SUMMARY"
  echo "  Total requests: $total" | tee -a "$SUMMARY"
  
  if [ "$total" -gt 0 ]; then
    local error_rate=$(awk "BEGIN {printf \"%.2f\", (($e500 + $esql + $er2) / $total) * 100}")
    echo "  Taxa de erro: $error_rate%" | tee -a "$SUMMARY"
  fi
  
  echo "" | tee -a "$SUMMARY"
  echo "🔴 ERROS CRÍTICOS:" | tee -a "$SUMMARY"
  echo "  Erros 500: $e500" | tee -a "$SUMMARY"
  echo "  Erros SQL: $esql" | tee -a "$SUMMARY"
  echo "  Erros R2: $er2" | tee -a "$SUMMARY"
  echo "" | tee -a "$SUMMARY"
  
  echo "🟡 AVISOS:" | tee -a "$SUMMARY"
  echo "  Erros 404: $e404" | tee -a "$SUMMARY"
  echo "" | tee -a "$SUMMARY"
  
  echo "📁 ARQUIVOS:" | tee -a "$SUMMARY"
  echo "  Log completo: $RAW_LOG" | tee -a "$SUMMARY"
  echo "  Relatório: $SUMMARY" | tee -a "$SUMMARY"
  echo "" | tee -a "$SUMMARY"
  
  # Limpar
  rm -f "$COUNT_FILE"
  
  echo "✅ Monitoramento concluído!"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Verificar wrangler
if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}Erro: wrangler não encontrado${NC}"
  exit 1
fi

# Mudar para worker dir
cd "$SCRIPT_DIR/worker-airtrust" || {
  echo -e "${RED}Erro: worker-airtrust/ não encontrado${NC}"
  exit 1
}

echo "Iniciando captura de logs..."
echo "Pressione Ctrl+C para parar"
echo ""

# Iniciar wrangler tail em background
wrangler tail --env "$ENV" > "$RAW_LOG" 2>&1 &
WRANGLER_PID=$!

echo "Wrangler tail rodando (PID: $WRANGLER_PID)"
echo ""

# Tempo limite
START_TIME=$(date +%s)
if [ "$DURATION" -eq 0 ]; then
  # Se DURATION=0, rodar por 5 minutos
  END_TIME=$((START_TIME + 300))
  echo "Modo teste: 5 minutos"
else
  END_TIME=$((START_TIME + DURATION * 3600))
fi

# Monitorar arquivo
sleep 2
tail -f "$RAW_LOG" 2>/dev/null | while IFS= read -r line; do
  # Verificar tempo
  current_time=$(date +%s)
  if [ $current_time -ge $END_TIME ]; then
    echo "Duração de $DURATION horas atingida"
    kill $WRANGLER_PID 2>/dev/null || true
    break
  fi
  
  # Contar requests (buscar por "outcome")
  if echo "$line" | grep -q '"outcome"'; then
    increment_counter "TOTAL_REQUESTS"
    echo -e "${GREEN}[REQUEST]${NC} Total: $(read_counter TOTAL_REQUESTS)"
  fi
  
  # Detectar erros 500
  if echo "$line" | grep -qE '"status":\s*500|Internal Server Error'; then
    increment_counter "ERRORS_500"
    echo -e "${RED}[ERRO 500]${NC} $(date '+%H:%M:%S') - Total: $(read_counter ERRORS_500)"
  fi
  
  # Detectar erros 404
  if echo "$line" | grep -qE '"status":\s*404'; then
    increment_counter "ERRORS_404"
    echo -e "${YELLOW}[404]${NC} $(date '+%H:%M:%S') - Total: $(read_counter ERRORS_404)"
  fi
  
  # Detectar SQL errors
  if echo "$line" | grep -qiE 'SQLITE_ERROR|SQL.*error|D1.*failed'; then
    increment_counter "ERRORS_SQL"
    echo -e "${RED}[SQL ERROR]${NC} $(date '+%H:%M:%S') - Total: $(read_counter ERRORS_SQL)"
  fi
  
  # Detectar R2 errors
  if echo "$line" | grep -qiE 'R2.*failed|bucket.*error|upload.*failed'; then
    increment_counter "ERRORS_R2"
    echo -e "${RED}[R2 ERROR]${NC} $(date '+%H:%M:%S') - Total: $(read_counter ERRORS_R2)"
  fi
  
  # Detectar exceptions
  if echo "$line" | grep -qE '"exceptions":\s*\[.+\]'; then
    echo -e "${RED}[EXCEPTION]${NC} $(date '+%H:%M:%S')"
  fi
done

# Cleanup será chamado automaticamente pelo trap EXIT
