#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$ROOT/dist/client/assets"

if [ ! -d "$ASSETS_DIR" ]; then
  exit 0
fi

removed=0
while IFS= read -r -d '' file_path; do
  file_name="$(basename "$file_path")"
  case "$file_name" in
    *" "[2-9].*|*" "[1-9][0-9].*)
      rm -f "$file_path"
      removed=$((removed + 1))
      ;;
  esac
done < <(find "$ASSETS_DIR" -type f -print0)

if [ "$removed" -gt 0 ]; then
  echo "🧹 Removidos $removed assets órfãos com sufixo de cópia em dist/client/assets"
fi