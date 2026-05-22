#!/usr/bin/env bash
# ── AirTrust EVD Soft-Conflict Regression Gate ──────────────────────────────
# Garante que OUT_OF_QUINZENA nunca vire hard block na Escala Diária.
#
# Regra: divergência de escala mensal (quinzena, alocação, situação) é
# soft_conflict selecionável, NUNCA hard block. Hard blocks reais são apenas:
# férias RH (sem vínculo com escala), CMA vencido, habilitação inválida,
# tripulante/aeronave inativos.
#
# Uso:  bash scripts/test-evd-soft-conflict-regression.sh
# CI:   bash scripts/test-evd-soft-conflict-regression.sh --ci
#        (--ci exige saída limpa; sem flag mostra resumo)
#───────────────────────────────────────────────────────────────────────────────

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CI_MODE=false
[[ "${1:-}" == "--ci" ]] && CI_MODE=true

PASS=0
FAIL=0
FAILURES=()

check() {
  local desc="$1"
  local result="$2"
  if [[ "$result" == "PASS" ]]; then
    ((PASS++)) || true
    $CI_MODE || echo "  [PASS] $desc"
  else
    ((FAIL++)) || true
    FAILURES+=("$desc: $result")
    echo "  [FAIL] $desc — $result"
  fi
}

echo "=== AirTrust EVD Soft-Conflict Regression Gate ==="
echo "repo=${REPO_ROOT}"
echo

# ── Gate 1: Backend — OUT_OF_QUINZENA não pode virar hard block ──────────────

TRIP_FILE="$REPO_ROOT/worker-airtrust/src/routes/escalas-tripulantes-operacionais.ts"
EVD_FILE="$REPO_ROOT/worker-airtrust/src/routes/escalas-evd.ts"
FRONTEND_FILE="$REPO_ROOT/src/react-app/pages/escalas/EvdPage.tsx"

if [[ ! -f "$TRIP_FILE" ]]; then
  echo "  [SKIP] escalas-tripulantes-operacionais.ts não encontrado"
else
  # 1a: OUT_OF_QUINZENA must only appear with pode_ser_alocado: true
  # Extract the block that returns OUT_OF_QUINZENA and verify it sets pode_ser_alocado: true
  OUT_OF_QUINZENA_BLOCKS=$(grep -n "OUT_OF_QUINZENA" "$TRIP_FILE" || true)

  if [[ -z "$OUT_OF_QUINZENA_BLOCKS" ]]; then
    check "OUT_OF_QUINZENA code exists in tripulantes-operacionais" "PASS"
  else
    # Find lines with OUT_OF_QUINZENA and check surrounding context for hard block patterns
    while IFS= read -r line; do
      lineno=$(echo "$line" | cut -d: -f1)
      # Look at a window around the OUT_OF_QUINZENA line to check pode_ser_alocado value
      window=$(sed -n "$((lineno - 20)),$((lineno + 5))p" "$TRIP_FILE" 2>/dev/null || true)

      # Anti-pattern: pode_ser_alocado: false near OUT_OF_QUINZENA
      if echo "$window" | grep -q "pode_ser_alocado:\s*false"; then
        check "Line $lineno: OUT_OF_QUINZENA with pode_ser_alocado:false" \
          "FAIL — hard block detected near OUT_OF_QUINZENA"
      fi

      # Required: conflict_code: 'OUT_OF_QUINZENA' with soft_conflict: true
      if echo "$window" | grep -q "conflict_code:\s*'OUT_OF_QUINZENA'" && \
         ! echo "$window" | grep -q "soft_conflict:\s*true"; then
        check "Line $lineno: OUT_OF_QUINZENA without soft_conflict:true" \
          "FAIL — soft_conflict must be true"
      fi
    done <<< "$OUT_OF_QUINZENA_BLOCKS"
  fi

  # 1b: soft_conflict must be true in the OUT_OF_QUINZENA return block
  if grep -B5 -A2 "OUT_OF_QUINZENA" "$TRIP_FILE" | grep -q "soft_conflict:\s*true"; then
    check "OUT_OF_QUINZENA block has soft_conflict: true" "PASS"
  else
    check "OUT_OF_QUINZENA block has soft_conflict: true" \
      "FAIL — OUT_OF_QUINZENA must set soft_conflict: true"
  fi

  # 1c: pode_ser_alocado: true must be set in the OUT_OF_QUINZENA path
  if grep -B5 -A2 "OUT_OF_QUINZENA" "$TRIP_FILE" | grep -q "pode_ser_alocado:\s*true"; then
    check "OUT_OF_QUINZENA block has pode_ser_alocado: true" "PASS"
  else
    check "OUT_OF_QUINZENA block has pode_ser_alocado: true" \
      "FAIL — OUT_OF_QUINZENA must set pode_ser_alocado: true"
  fi

  # 1d: sort must rank soft_conflict between available(0) and blocked(2)
  if grep -q "soft_conflict.*1.*:.*0.*:.*2" "$TRIP_FILE" || \
     grep -A2 "sort.*TripulanteComQuinzena" "$TRIP_FILE" | grep -q "soft_conflict"; then
    check "Sort ranks soft_conflict (rank 1) between available (0) and blocked (2)" "PASS"
  else
    check "Sort ranks soft_conflict (rank 1) between available (0) and blocked (2)" \
      "WARN — verify sort order in tripulantes-operacionais.ts"
  fi
fi

# ── Gate 2: Backend — POST validation must treat monthly scale as soft ───────

if [[ ! -f "$EVD_FILE" ]]; then
  echo "  [SKIP] escalas-evd.ts não encontrado"
else
  # 2a: validateCrewAvailabilityOnMonthlyScale must return blocked:false for non-ferias
  # The function should have soft_conflict: true when returning OTHER_ESCALA_*
  if grep -q "OTHER_ESCALA_OPERATIONAL\|OTHER_ESCALA_SITUACAO" "$EVD_FILE"; then
    OTHER_ESCALA_CTX=$(grep -B3 -A5 "OTHER_ESCALA_OPERATIONAL\|OTHER_ESCALA_SITUACAO" "$EVD_FILE" || true)
    if echo "$OTHER_ESCALA_CTX" | grep -q "blocked:\s*false" && \
       echo "$OTHER_ESCALA_CTX" | grep -q "soft_conflict:\s*true"; then
      check "POST validateCrewAvailability: OTHER_ESCALA returns blocked:false + soft_conflict:true" "PASS"
    else
      check "POST validateCrewAvailability: OTHER_ESCALA returns blocked:false + soft_conflict:true" \
        "FAIL — other escala must not hard-block in POST validation"
    fi
  fi

  # 2b: FERIAS_RH must return blocked:true (hard block)
  if grep -B3 -A5 "FERIAS_UNAVAILABLE\|funcionario_ferias" "$EVD_FILE" | grep -q "blocked:\s*true"; then
    check "POST validateCrewAvailability: real ferias returns blocked:true" "PASS"
  else
    check "POST validateCrewAvailability: real ferias returns blocked:true" \
      "WARN — verify ferias is a hard block in POST"
  fi

  # 2c: escala_alocacao_id IS NULL must be in the ferias query
  if grep -q "escala_alocacao_id IS NULL" "$EVD_FILE"; then
    check "POST ferias query filters escala_alocacao_id IS NULL" "PASS"
  else
    check "POST ferias query filters escala_alocacao_id IS NULL" \
      "FAIL — ferias query must exclude escala-linked vacations"
  fi
fi

# ── Gate 3: Frontend — soft_conflict must NOT go into "Indisponíveis" group ──

if [[ ! -f "$FRONTEND_FILE" ]]; then
  echo "  [SKIP] EvdPage.tsx não encontrado"
else
  # 3a: tripulantesAptos filters by pode_ser_alocado (not soft_conflict)
  APTOS_FILTER=$(grep "tripulantesAptos" "$FRONTEND_FILE" | head -1 || true)
  if echo "$APTOS_FILTER" | grep -q "pode_ser_alocado"; then
    check "Frontend tripulantesAptos filters by pode_ser_alocado" "PASS"
  else
    check "Frontend tripulantesAptos filters by pode_ser_alocado" \
      "WARN — verify aptos filter uses pode_ser_alocado"
  fi

  # 3b: tripulantesBloqueados filters by !pode_ser_alocado
  BLOQ_FILTER=$(grep "tripulantesBloqueados" "$FRONTEND_FILE" | head -1 || true)
  if echo "$BLOQ_FILTER" | grep -q "!.*pode_ser_alocado"; then
    check "Frontend tripulantesBloqueados filters by !pode_ser_alocado" "PASS"
  else
    check "Frontend tripulantesBloqueados filters by !pode_ser_alocado" \
      "WARN — verify blocked filter uses !pode_ser_alocado"
  fi

  # 3c: soft_conflict note rendered in selectable group (not disabled)
  # The ternary may span multiple lines; check each label separately.
  if grep -q "Conflito escala" "$FRONTEND_FILE" && grep -q "'FRMS_CRITICAL'" "$FRONTEND_FILE"; then
    check "Frontend renders soft_conflict label ([!] Conflito escala / [!] Alerta FRMS by conflict_code)" "PASS"
  else
    check "Frontend renders soft_conflict label ([!] Conflito escala / [!] Alerta FRMS by conflict_code)" \
      "WARN — verify soft_conflict visual indicator in dropdown"
  fi

  # 3d: optgroup "Indisponíveis" should use disabled options (for blocked)
  if grep -q "Indisponíveis.*bloqueados" "$FRONTEND_FILE"; then
    check "Frontend has 'Indisponíveis (bloqueados)' optgroup" "PASS"
  else
    check "Frontend has 'Indisponíveis (bloqueados)' optgroup" \
      "WARN — verify blocked crew rendered in disabled group"
  fi
fi

# ── Gate 4: Diagnostic script integrity ──────────────────────────────────────

DIAG_FILE="$REPO_ROOT/scripts/diagnose-evd-availability-frms.sh"
if [[ -f "$DIAG_FILE" ]]; then
  if grep -q "soft_conflict_quinzena" "$DIAG_FILE"; then
    check "Diagnostic script tracks soft_conflict_quinzena" "PASS"
  else
    check "Diagnostic script tracks soft_conflict_quinzena" \
      "WARN — diagnostic script may still use old fora_quinzena metric"
  fi
fi

# ── Gate 5: Backend — BLOQUEADO_CMA hard block com motivo explícito ──────────

if [[ -f "$TRIP_FILE" ]]; then
  # 5a: BLOQUEADO_CMA still hard-blocks with readable motivo
  if grep -q "BLOQUEADO_CMA" "$TRIP_FILE" && grep -q "CMA vencido" "$TRIP_FILE"; then
    check "Backend derives motivo_bloqueio for BLOQUEADO_CMA (hard block)" "PASS"
  else
    check "Backend derives motivo_bloqueio for BLOQUEADO_CMA (hard block)" \
      "FAIL — BLOQUEADO_CMA must produce motivo string 'CMA vencido...'"
  fi

  # 5b: motivo_bloqueio derivation guards on !pode_ser_alocado for remaining hard blocks
  if grep -q "pode_ser_alocado.*motivo_bloqueio\|motivo_bloqueio.*pode_ser_alocado" "$TRIP_FILE"; then
    check "Backend motivo_bloqueio derivation guards on !pode_ser_alocado" "PASS"
  else
    check "Backend motivo_bloqueio derivation guards on !pode_ser_alocado" \
      "WARN — verify derivation pass only fires for actual hard blocks"
  fi

  # 5c: TripulanteComQuinzena type includes motivo_bloqueio field
  if grep -q "motivo_bloqueio\?:" "$TRIP_FILE"; then
    check "TripulanteComQuinzena type includes motivo_bloqueio field" "PASS"
  else
    check "TripulanteComQuinzena type includes motivo_bloqueio field" \
      "FAIL — motivo_bloqueio must be in TripulanteComQuinzena type"
  fi
fi

# ── Gate 6: Backend — BLOQUEADO_FRMS vira soft_conflict na EVD ───────────────

if [[ -f "$TRIP_FILE" ]]; then
  # 6a: FRMS_CRITICAL conflict_code must be set
  if grep -q "FRMS_CRITICAL" "$TRIP_FILE"; then
    check "Backend FRMS normalization uses conflict_code FRMS_CRITICAL" "PASS"
  else
    check "Backend FRMS normalization uses conflict_code FRMS_CRITICAL" \
      "FAIL — normalization pass must set conflict_code: 'FRMS_CRITICAL'"
  fi

  # 6b: FRMS normalization must set soft_conflict: true
  FRMS_BLOCK=$(grep -A10 "BLOQUEADO_FRMS.*pode_ser_alocado\|status_operacional.*BLOQUEADO_FRMS" "$TRIP_FILE" 2>/dev/null || true)
  if echo "$FRMS_BLOCK" | grep -q "soft_conflict: true"; then
    check "Backend FRMS normalization sets soft_conflict: true" "PASS"
  else
    check "Backend FRMS normalization sets soft_conflict: true" \
      "FAIL — BLOQUEADO_FRMS must produce soft_conflict: true in EVD endpoint"
  fi

  # 6c: FRMS normalization must set pode_ser_alocado: true (not hard block)
  if echo "$FRMS_BLOCK" | grep -q "pode_ser_alocado: true"; then
    check "Backend FRMS normalization sets pode_ser_alocado: true" "PASS"
  else
    check "Backend FRMS normalization sets pode_ser_alocado: true" \
      "FAIL — BLOQUEADO_FRMS must not leave pode_ser_alocado: false in EVD"
  fi

  # 6d: FRMS normalization must set motivo_bloqueio: null (not expose block reason as hard block)
  if grep -A12 "status_operacional !== 'BLOQUEADO_FRMS'" "$TRIP_FILE" | grep -q "motivo_bloqueio: null"; then
    check "Backend FRMS normalization clears motivo_bloqueio (null)" "PASS"
  else
    check "Backend FRMS normalization clears motivo_bloqueio (null)" \
      "WARN — FRMS soft_conflict should set motivo_bloqueio: null"
  fi

  # 6e: Anti-regression — BLOQUEADO_FRMS must NOT appear as hard block in final pass
  # The old string 'Bloqueio FRMS' must not exist (it was the hard-block motivo)
  if grep -q "'Bloqueio FRMS" "$TRIP_FILE" || grep -q "\"Bloqueio FRMS" "$TRIP_FILE"; then
    check "Backend does NOT hard-block BLOQUEADO_FRMS with motivo string" \
      "FAIL — old 'Bloqueio FRMS' hard-block motivo found; remove it"
  else
    check "Backend does NOT hard-block BLOQUEADO_FRMS with motivo string" "PASS"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo
echo "=== Resultado: $PASS pass, $FAIL fail ==="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "Falhas:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  echo
  echo "REGRESSION GATE FAILED"
  exit 1
fi

echo "REGRESSION GATE PASSED"
exit 0
