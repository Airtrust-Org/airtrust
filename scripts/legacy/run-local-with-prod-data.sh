#!/bin/bash

# ============================================================================
# 🚀 RUN LOCALLY WITH PRODUCTION DATA
# Roda o sistema localmente em localhost:3000 com dados de produção
# ============================================================================

set -e

echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  🔴 RUNNING LOCALLY WITH PRODUCTION DATA                            ║"
echo "║  Access: http://localhost:3000                                      ║"
echo "║  ⚠️  Using REAL production database and storage                     ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# ============================================================================
# Step 1: Check for required environment variables
# ============================================================================
echo "📋 Checking environment variables..."

REQUIRED_VARS=(
  "CLOUDFLARE_ACCOUNT_ID"
  "CLOUDFLARE_R2_ACCESS_KEY_ID"
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY"
  "CLOUDFLARE_D1_DB_ID"
  "CLOUDFLARE_AUTH_TOKEN"
  "PRODUCTION_JWT_SECRET"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  echo ""
  echo "❌ Missing required environment variables:"
  for var in "${MISSING_VARS[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "📖 To set them, run:"
  echo ""
  echo "   export CLOUDFLARE_ACCOUNT_ID='your-value'"
  echo "   export CLOUDFLARE_R2_ACCESS_KEY_ID='your-value'"
  echo "   export CLOUDFLARE_R2_SECRET_ACCESS_KEY='your-value'"
  echo "   export CLOUDFLARE_D1_DB_ID='your-value'"
  echo "   export CLOUDFLARE_AUTH_TOKEN='your-value'"
  echo "   export PRODUCTION_JWT_SECRET='your-value'"
  echo ""
  echo "   Then run: bash run-local-with-prod-data.sh"
  echo ""
  exit 1
fi

echo "✅ All environment variables set"
echo ""

# ============================================================================
# Step 2: Load environment file
# ============================================================================
echo "📝 Loading .env.local.production..."

if [ -f ".env.local.production" ]; then
  export $(cat .env.local.production | grep -v '^#' | xargs)
  echo "✅ Environment file loaded"
else
  echo "⚠️  .env.local.production not found, using exports only"
fi

echo ""

# ============================================================================
# Step 3: Check Node modules
# ============================================================================
echo "📦 Checking dependencies..."

if [ ! -d "node_modules" ]; then
  echo "📥 Installing dependencies..."
  npm install
else
  echo "✅ Dependencies installed"
fi

echo ""

# ============================================================================
# Step 4: Build frontend
# ============================================================================
echo "🔨 Building frontend..."

npm run build:client 2>&1 | tail -10

if [ $? -eq 0 ]; then
  echo "✅ Frontend build complete"
else
  echo "⚠️  Frontend build had warnings (continuing...)"
fi

echo ""

# ============================================================================
# Step 5: Start development server
# ============================================================================
echo "🚀 Starting development server on http://localhost:3000..."
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
