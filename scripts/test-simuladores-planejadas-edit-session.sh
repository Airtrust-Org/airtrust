#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Running simuladores planejadas PUT regression gate"
cd "$ROOT_DIR/worker-airtrust"
npx vitest run src/__tests__/routes/simuladores-planejadas-edit-session.test.ts
