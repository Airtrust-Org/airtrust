#!/usr/bin/env bash
set -euo pipefail

# Drop all __backup_* tables from a Cloudflare D1 database in a FK-safe manner.
# Usage: ./scripts/cleanup-backup-tables.sh --db <db_name>

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

db_name=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --db|-d)
      db_name="$2"; shift 2 ;;
    *)
      echo -e "${YELLOW}⚠️  Ignoring unknown argument: $1${NC}"; shift ;;
  esac
done

if ! command -v wrangler >/dev/null 2>&1; then
  echo -e "${RED}❌ wrangler CLI not found. Install it first.${NC}"
  exit 1
fi

if [[ -z "${db_name}" ]]; then
  echo -e "${RED}❌ Missing --db <db_name>${NC}"
  exit 1
fi

echo -e "📋 Listing backup tables in ${db_name}..."
TABLES_JSON=$(wrangler d1 execute "${db_name}" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '__backup_%' ORDER BY name;" --json || true)

# Extract names as newline-separated list
if command -v jq >/dev/null 2>&1; then
  TABLES=$(echo "$TABLES_JSON" | jq -r '.[0].results[]?.name // empty')
else
  TABLES=$(echo "$TABLES_JSON" | grep -o '\"name\":\"[^\"]\+\"' | awk -F'\"' '{print $4}')
fi

if [[ -z "${TABLES}" ]]; then
  echo -e "${YELLOW}ℹ️  No __backup_* tables found.${NC}"
  exit 0
fi

COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')
echo "Found ${COUNT} tables:"
echo "$TABLES" | while IFS= read -r t; do
  echo "  - ${t}"
done

echo -e "\n🧹 Dropping tables with PRAGMA foreign_keys=OFF (per statement)...\n"
DROPPED=0
FAILED=0
OLDIFS=$IFS
IFS=$'\n'
for t in $TABLES; do
  echo -n "Drop ${t} ... "
  # Execute PRAGMA OFF + DROP in a single connection
  if wrangler d1 execute "${db_name}" --remote --command "PRAGMA foreign_keys=OFF; DROP TABLE IF EXISTS ${t}; PRAGMA foreign_keys=ON;" >/dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
    DROPPED=$((DROPPED+1))
  else
    echo -e "${RED}FAIL${NC}"
    FAILED=$((FAILED+1))
  fi
  sleep 0.1
done
IFS=$OLDIFS

echo -e "\n✅ Dropped: ${DROPPED}  ❌ Failed: ${FAILED}"
if [[ $FAILED -gt 0 ]]; then
  echo -e "${YELLOW}⚠️  Some tables failed to drop. They may be referenced by TEMP views or still-registered FKs. Retry individually if needed.${NC}"
fi

exit 0
