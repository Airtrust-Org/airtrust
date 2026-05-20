#!/bin/bash
set -euo pipefail

echo "📦 Importing production data from backup to production D1"
echo ""

BACKUP_FILE="migrations/data-export/prod_data_clean.sql"
cd "$(dirname "$0")"

if [ ! -f "../$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Extract funcionarios and qualificacoes_historico
echo "🔍 Extracting tables from backup..."
EXTRACT_FILE=".extract-prod-data.sql"

# Extract only the two canonical tables
grep -E "^INSERT INTO \"(funcionarios|qualificacoes_historico)\"" "../$BACKUP_FILE" > "$EXTRACT_FILE" || true

FUNC_COUNT=$(grep -c "INSERT INTO \"funcionarios\"" "$EXTRACT_FILE" || true)
QUAL_COUNT=$(grep -c "INSERT INTO \"qualificacoes_historico\"" "$EXTRACT_FILE" || true)

echo "✅ Extracted from backup:"
echo "   • funcionarios: $FUNC_COUNT rows"
echo "   • qualificacoes_historico: $QUAL_COUNT rows"
echo ""

if [ "$FUNC_COUNT" -eq 0 ] || [ "$QUAL_COUNT" -eq 0 ]; then
  echo "❌ No data found to import"
  rm -f "$EXTRACT_FILE"
  exit 1
fi

# Apply to PRODUCTION D1 (--remote)
echo "🚀 Applying to PRODUCTION D1 database..."
echo "⚠️  This will modify production data!"
echo ""

if wrangler d1 execute DB --file "$EXTRACT_FILE" --remote --env production; then
  echo ""
  echo "✅ Data successfully imported to production!"
  echo ""
  echo "📊 Verification counts:"
  wrangler d1 execute DB --command "SELECT COUNT(*) as funcionarios_count FROM funcionarios;" --remote --env production
  echo ""
  wrangler d1 execute DB --command "SELECT COUNT(*) as qualificacoes_count FROM qualificacoes_historico;" --remote --env production
  echo ""
  echo "✨ Localhost can now access production data via --env production"
  echo "💡 To develop with production DB: npm run dev -- --env production"
else
  echo "❌ Import failed"
  rm -f "$EXTRACT_FILE"
  exit 1
fi

rm -f "$EXTRACT_FILE"
echo "🎉 Done!"
