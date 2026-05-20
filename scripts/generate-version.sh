#!/bin/bash
# Generate version info from git hash + timestamp
set -euo pipefail

# Get git hash (short)
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")

# Get build timestamp in ISO format
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create version string: timestamp-hash
APP_VERSION="${BUILD_TIME}-${GIT_HASH}"

# Output for shell evaluation (source this script)
echo "export APP_VERSION='${APP_VERSION}'"
echo "export APP_BUILD_TIME='${BUILD_TIME}'"

# Also output to console for visibility
>&2 echo "📦 Version generated: ${APP_VERSION}"
>&2 echo "🕐 Build time: ${BUILD_TIME}"
