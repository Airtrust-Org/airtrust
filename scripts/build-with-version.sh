#!/bin/bash
# Build with auto-generated version info
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🔨 Gerando versão..."
eval "$(./scripts/generate-version.sh)"

echo "🔨 Building frontend..."
vite build

echo "✅ Build completo!"
echo "   Version: ${APP_VERSION}"
echo "   Build Time: ${APP_BUILD_TIME}"
