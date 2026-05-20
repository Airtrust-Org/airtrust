#!/usr/bin/env bash
set -euo pipefail

pkill -f "vite" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "wrangler dev" 2>/dev/null || true

[ -d "node_modules/.vite" ] && rm -rf node_modules/.vite || true
[ -d "dist" ] && rm -rf dist || true
[ -f "tsconfig.tsbuildinfo" ] && rm -f tsconfig.tsbuildinfo || true
[ -d ".wrangler" ] && rm -rf .wrangler || true

echo "Cache limpo."