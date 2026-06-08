#!/usr/bin/env bash
# Guard: novas migrations não podem introduzir empresa_id INTEGER DEFAULT 1.
# Migrations históricas (≤ 0394) são allowlisted — foram aceitas durante a
# multi-tenantização inicial e exigem rebuild de tabela em SQLite para correção.
# Qualquer migration com número > THRESHOLD que introduza este padrão é um erro.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/worker-airtrust/migrations"

# Last migration number accepted with DEFAULT 1 as known legacy.
# Update this if a future lote explicitly accepts DEFAULT 1 with justification.
THRESHOLD="0394"

fail=0
hits=""

while IFS= read -r filepath; do
  filename="$(basename "$filepath")"

  # Skip files that don't follow the NNNN_ numeric prefix format
  if [[ ! "$filename" =~ ^([0-9]+)_ ]]; then
    continue
  fi

  num_raw="${BASH_REMATCH[1]}"

  # Zero-pad to 4 digits for lexicographic comparison
  num_padded="$(printf '%04d' "$((10#$num_raw))")"

  # Skip if at or below threshold (historical/allowlisted)
  if [[ ! "$num_padded" > "$THRESHOLD" ]]; then
    continue
  fi

  # Check for the dangerous pattern
  matches="$(grep -niE 'empresa_id[[:space:]]+(INTEGER|INT)[[:space:]]+DEFAULT[[:space:]]+1' "$filepath" || true)"
  if [[ -n "$matches" ]]; then
    hits+=$'\n'"ERROR: $filename introduces empresa_id DEFAULT 1 (threshold=$THRESHOLD):"$'\n'"$matches"$'\n'
    fail=1
  fi

done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name "*.sql" -type f | sort)

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "$hits"
  echo "RESULT: FAIL — new migration(s) above threshold $THRESHOLD use empresa_id DEFAULT 1."
  echo "Use empresa_id INTEGER NOT NULL and supply it explicitly in INSERT/backfill."
  exit 1
fi

echo "OK: no new empresa_id DEFAULT 1 found above migration threshold $THRESHOLD"
echo "RESULT: PASS"
