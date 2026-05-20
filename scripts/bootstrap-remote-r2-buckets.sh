#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
WRANGLER=(npx -y node@20 node_modules/wrangler/bin/wrangler.js)
BUCKETS=(
  airtrust-storage-dev
  airtrust-storage-staging
)

info() {
  printf '\033[0;34mℹ\033[0m  %s\n' "$*"
}

ok() {
  printf '\033[0;32m✓\033[0m  %s\n' "$*"
}

fail() {
  printf '\033[0;31m✗\033[0m  %s\n' "$*" >&2
  exit 1
}

[[ -d "$WORKER_DIR" ]] || fail "worker-airtrust não encontrado"

run_wranger() {
  (
    cd "$WORKER_DIR"
    "$@"
  )
}

info "Listando buckets R2 existentes"
EXISTING="$(run_wranger "${WRANGLER[@]}" r2 bucket list 2>/dev/null || true)"

for bucket in "${BUCKETS[@]}"; do
  if grep -q "$bucket" <<<"$EXISTING"; then
    ok "Bucket já existe: $bucket"
    continue
  fi

  info "Criando bucket: $bucket"
  run_wranger "${WRANGLER[@]}" r2 bucket create "$bucket"
  ok "Bucket criado: $bucket"
done

echo ""
ok "Provisionamento R2 concluído"