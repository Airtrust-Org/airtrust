#!/usr/bin/env bash
set -euo pipefail

echo "❌ Script desativado por segurança."
echo ""
echo "Este repositório não permite mais localhost apontando para produção."
echo "Use um dos fluxos seguros abaixo:"
echo "  - npm run dev:safe"
echo "  - npm run setup:local:reset"
echo "  - npm run sync:prod:local:safe"
echo "  - npm run sync:prod:dev:safe"
exit 1
