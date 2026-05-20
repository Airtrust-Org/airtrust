#!/bin/bash

# Performance Test Suite - All Modules
# Tests response times, cache hit rates, and payload sizes
# Date: 2025-11-06

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Metrics storage
declare -A METRICS

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     AIRTRUST PERFORMANCE TEST - ALL MODULES                    ║"
echo "║                                                                ║"
echo "║  Testing: Response Time, Cache Hits, Payload Size              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Function to test endpoint
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local expected_code=$4
  
  echo -n "Testing $name... "
  
  # Make 3 requests to test cache behavior
  for i in {1..3}; do
    response=$(curl -s -w "\n%{http_code}|%{time_total}|%{size_download}" \
      -X "$method" \
      "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      2>/dev/null)
    
    # Parse response
    body=$(echo "$response" | head -n -1)
    metrics=$(echo "$response" | tail -n 1)
    
    http_code=$(echo "$metrics" | cut -d'|' -f2)
    time_total=$(echo "$metrics" | cut -d'|' -f3)
    size=$(echo "$metrics" | cut -d'|' -f4)
    
    # Check cache header
    cache_header=$(curl -s -I -X "$method" "$BASE_URL$endpoint" 2>/dev/null | grep -i "X-Cache" | head -1)
    cache_status=$(echo "$cache_header" | cut -d':' -f2 | xargs)
    
    # Store metrics
    key="${name}_${i}"
    METRICS[$key]="$http_code|$time_total|$size|$cache_status"
    
    # Validate response
    if [ "$http_code" != "$expected_code" ]; then
      echo -e "${RED}❌ FAILED (HTTP $http_code - Expected $expected_code)${NC}"
      return 1
    fi
  done
  
  echo -e "${GREEN}✅ OK${NC}"
  return 0
}

# Function to format time in ms
format_time() {
  echo "scale=2; $1 * 1000" | bc
}

# Function to format size
format_size() {
  echo "scale=1; $1 / 1024" | bc
}

# ============================================================================
# BLOCO 1: CORE ENDPOINTS
# ============================================================================
echo -e "${BLUE}▶ BLOCO 1: CORE ENDPOINTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "Health Check" "GET" "/health" "200"
test_endpoint "Funcionários (List)" "GET" "/funcionarios?page=1&limit=20" "200"
test_endpoint "Funcionários (Instrutores)" "GET" "/funcionarios/instrutores" "200"
test_endpoint "Simuladores" "GET" "/simuladores?page=1&limit=20" "200"
test_endpoint "Templates" "GET" "/simuladores-consolidado/templates" "200"
test_endpoint "Agendamentos" "GET" "/agendamentos?page=1&limit=20" "200"
test_endpoint "Fichas" "GET" "/fichas?page=1&limit=20" "200"
test_endpoint "Manobras" "GET" "/manobras?page=1&limit=20" "200"

echo ""
echo -e "${BLUE}▶ BLOCO 2: QUALIFICATIONS MODULE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "Qualificações (List)" "GET" "/qualificacoes?page=1&limit=20" "200"
test_endpoint "Qualificações (Alertas)" "GET" "/qualificacoes/alertas-vencimento" "200"
test_endpoint "Qualificações (Stats)" "GET" "/qualificacoes/dashboard-stats" "200"

echo ""
echo -e "${BLUE}▶ BLOCO 3: QUALIFICATIONS DETAILS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get a funcionario ID first
FUNC_ID=$(curl -s "$BASE_URL/funcionarios?limit=1" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
if [ ! -z "$FUNC_ID" ]; then
  test_endpoint "Qualificações por Funcionário" "GET" "/qualificacoes/funcionario/$FUNC_ID" "200"
  test_endpoint "Histórico de Qualificações" "GET" "/qualificacoes/historico/$FUNC_ID" "200"
fi

echo ""
echo -e "${BLUE}▶ BLOCO 4: HABILITACOES MODULE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "Habilitações (List)" "GET" "/habilitacoes?page=1&limit=20" "200"
test_endpoint "Habilitações (Dashboard)" "GET" "/habilitacoes/dashboard" "200"
test_endpoint "Habilitações (Alertas)" "GET" "/habilitacoes/alertas" "200"

echo ""
echo -e "${BLUE}▶ BLOCO 5: CONSOLIDATED ENDPOINTS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "Equipamentos Consolidado" "GET" "/simuladores-consolidado/equipamentos" "200"
test_endpoint "Manobras Disponíveis" "GET" "/simuladores-consolidado/manobras-disponiveis" "200"

echo ""
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                   PERFORMANCE ANALYSIS                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Analyze metrics
declare -A request_times
declare -A cache_hits

for key in "${!METRICS[@]}"; do
  IFS='|' read -r http_code time size cache <<< "${METRICS[$key]}"
  
  endpoint_name=$(echo "$key" | sed 's/_[0-9]*$//')
  
  # Store times
  if [ -z "${request_times[$endpoint_name]}" ]; then
    request_times[$endpoint_name]="$time"
  else
    prev_time=$(echo "${request_times[$endpoint_name]}" | cut -d' ' -f1)
    sum=$(echo "scale=4; $prev_time + $time" | bc)
    count=$(echo "${request_times[$endpoint_name]}" | wc -w)
    count=$((count + 1))
    request_times[$endpoint_name]="$sum $count"
  fi
  
  # Count cache hits
  if [[ "$cache" == "HIT" ]]; then
    cache_hits[$endpoint_name]=$((${cache_hits[$endpoint_name]:-0} + 1))
  fi
done

# Print analysis
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ENDPOINT                           | AVG TIME  | CACHE HITS | STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for endpoint in "${!request_times[@]}"; do
  times_data="${request_times[$endpoint]}"
  sum_time=$(echo "$times_data" | cut -d' ' -f1)
  count=$(echo "$times_data" | cut -d' ' -f2)
  
  avg_time=$(echo "scale=3; $sum_time / $count" | bc)
  avg_ms=$(format_time "$avg_time")
  
  cache_count=${cache_hits[$endpoint]:-0}
  cache_rate=$((cache_count * 100 / 3))
  
  # Determine status
  if (( $(echo "$avg_time < 0.1" | bc -l) )); then
    status="${GREEN}EXCELLENT${NC}"
  elif (( $(echo "$avg_time < 0.3" | bc -l) )); then
    status="${GREEN}GOOD${NC}"
  elif (( $(echo "$avg_time < 0.5" | bc -l) )); then
    status="${YELLOW}OK${NC}"
  else
    status="${RED}SLOW${NC}"
  fi
  
  printf "  %-34s | %6.1f ms | %3d%%     | ${status}\n" "$endpoint" "$avg_ms" "$cache_rate"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Summary statistics
total_endpoints=${#request_times[@]}
excellent=0
good=0
ok=0
slow=0

for endpoint in "${!request_times[@]}"; do
  times_data="${request_times[$endpoint]}"
  sum_time=$(echo "$times_data" | cut -d' ' -f1)
  count=$(echo "$times_data" | cut -d' ' -f2)
  avg_time=$(echo "scale=3; $sum_time / $count" | bc)
  
  if (( $(echo "$avg_time < 0.1" | bc -l) )); then
    excellent=$((excellent + 1))
  elif (( $(echo "$avg_time < 0.3" | bc -l) )); then
    good=$((good + 1))
  elif (( $(echo "$avg_time < 0.5" | bc -l) )); then
    ok=$((ok + 1))
  else
    slow=$((slow + 1))
  fi
done

echo "📊 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Endpoints Tested: $total_endpoints"
echo "  ${GREEN}Excellent (< 100ms):${NC}   $excellent"
echo "  ${GREEN}Good (100-300ms):${NC}     $good"
echo "  ${YELLOW}OK (300-500ms):${NC}        $ok"
echo "  ${RED}Slow (> 500ms):${NC}       $slow"
echo ""

# Cache effectiveness
total_cache_hits=0
total_requests=0

for endpoint in "${!cache_hits[@]}"; do
  total_cache_hits=$((total_cache_hits + ${cache_hits[$endpoint]:-0}))
done

total_requests=$((total_endpoints * 3))
cache_effectiveness=$((total_cache_hits * 100 / total_requests))

echo "💾 CACHE EFFECTIVENESS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Requests: $total_requests"
echo "Cache Hits: $total_cache_hits"
echo "Hit Rate: $cache_effectiveness%"
echo ""

# Performance tier
if [ $slow -eq 0 ] && [ $ok -le 2 ]; then
  perf_tier="${GREEN}🚀 PRODUCTION READY${NC}"
  perf_score="A+"
elif [ $slow -le 2 ]; then
  perf_tier="${GREEN}✅ GOOD${NC}"
  perf_score="A"
elif [ $slow -le 5 ]; then
  perf_tier="${YELLOW}⚠️  NEEDS OPTIMIZATION${NC}"
  perf_score="B"
else
  perf_tier="${RED}❌ CRITICAL${NC}"
  perf_score="F"
fi

echo "📈 OVERALL PERFORMANCE RATING"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Grade: $perf_score"
echo "Status: $perf_tier"
echo ""

# Save report
REPORT_FILE="test-reports/PERFORMANCE_REPORT_$(date +%Y%m%d_%H%M%S).txt"
mkdir -p test-reports

{
  echo "AIRTRUST PERFORMANCE TEST REPORT"
  echo "Date: $(date)"
  echo "=================================="
  echo ""
  echo "DETAILED METRICS:"
  echo ""
  for endpoint in "${!request_times[@]}"; do
    times_data="${request_times[$endpoint]}"
    sum_time=$(echo "$times_data" | cut -d' ' -f1)
    count=$(echo "$times_data" | cut -d' ' -f2)
    avg_time=$(echo "scale=3; $sum_time / $count" | bc)
    cache_count=${cache_hits[$endpoint]:-0}
    cache_rate=$((cache_count * 100 / 3))
    
    echo "$endpoint:"
    echo "  Average Response Time: $(format_time "$avg_time") ms"
    echo "  Cache Hit Rate: $cache_rate%"
    echo ""
  done
  echo "SUMMARY:"
  echo "Total Endpoints: $total_endpoints"
  echo "Excellent: $excellent | Good: $good | OK: $ok | Slow: $slow"
  echo "Cache Hit Rate: $cache_effectiveness%"
  echo "Overall Grade: $perf_score"
} > "$REPORT_FILE"

echo "📄 Report saved to: $REPORT_FILE"
echo ""
echo "✅ Performance test complete!"
