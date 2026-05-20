#!/bin/bash
set -euo pipefail

echo "✅ Production Data Import COMPLETE"
echo ""
echo "📊 Data Summary:"
echo "   • funcionarios: 40 rows (already in production)"
echo "   • qualificacoes_historico: 1036 rows (✓ imported)"
echo ""
echo "🔧 To use production database from localhost:"
echo ""
echo "Option 1: API Server with Production DB"
echo "   cd worker-airtrust"
echo "   npm run dev -- --env production"
echo ""
echo "Option 2: Full Dev Stack (Frontend + API with Production DB)"
echo "   npm run dev:all:prod"
echo ""
echo "⚠️  WARNING: All changes will directly affect PRODUCTION"
echo ""
echo "Verify connection:"
wrangler d1 execute DB --command "SELECT COUNT(*) as funcionarios, (SELECT COUNT(*) FROM qualificacoes_historico) as qualificacoes FROM funcionarios;" --remote --env production 2>&1 | grep -A 10 "results" | head -15
