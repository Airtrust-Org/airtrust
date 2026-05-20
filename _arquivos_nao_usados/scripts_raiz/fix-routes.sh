#!/bin/bash

# Script para configurar _routes.json corretamente para Cloudflare Pages SPA

ROUTES_FILE="dist/client/_routes.json"

cat > "$ROUTES_FILE" << 'EOF'
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/api/*", "/health/*", "/assets/*", "/images/*", "/fonts/*", "*.woff*", "*.ttf", "*.css", "*.js", "*.json", "*.txt", "*.svg", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico", "*.webmanifest"]
}
EOF

echo "✅ _routes.json criado em $ROUTES_FILE"
cat "$ROUTES_FILE"
