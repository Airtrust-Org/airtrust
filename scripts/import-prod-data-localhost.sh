#!/bin/bash
set -euo pipefail

echo "🔍 Extracting production data for: funcionarios, qualificacoes_historico"
echo ""

# Extract data file location
BACKUP_FILE="migrations/data-export/prod_data_clean.sql"
OUTPUT_FILE="migrations/data-export/import-localhost.sql"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "📦 Extracting tables from backup..."

# Extract only the tables we need with grep
cat "$BACKUP_FILE" | grep -E "^INSERT INTO \"(funcionarios|qualificacoes_historico)\"" > "$OUTPUT_FILE"

FUNC_COUNT=$(grep -c "INSERT INTO \"funcionarios\"" "$OUTPUT_FILE" || true)
QUAL_COUNT=$(grep -c "INSERT INTO \"qualificacoes_historico\"" "$OUTPUT_FILE" || true)

echo "✅ Extracted:"
echo "   • funcionarios: $FUNC_COUNT rows"
echo "   • qualificacoes_historico: $QUAL_COUNT rows"
echo ""

# Check if output file has content
if [ ! -s "$OUTPUT_FILE" ]; then
  echo "❌ No data extracted! Check backup file structure."
  exit 1
fi

echo "📝 Output saved to: $OUTPUT_FILE"
echo "📊 Total lines: $(wc -l < "$OUTPUT_FILE")"
echo ""

# Apply to localhost (from worker-airtrust directory where wrangler.toml is)
echo "🚀 Applying to localhost D1..."
cd "$(dirname "$0")/../worker-airtrust"

if wrangler d1 execute DB --file "../$OUTPUT_FILE"; then
  echo "✅ Data successfully imported to localhost!"
  echo ""
  echo "📈 Verification:"
  echo "   Running counts..."
  wrangler d1 execute DB --command "SELECT COUNT(*) as funcionarios_count FROM funcionarios;"
  wrangler d1 execute DB --command "SELECT COUNT(*) as qualificacoes_count FROM qualificacoes_historico;"
else
  echo "⚠️  Import to localhost encountered an error."
  echo "💡 Try: wrangler d1 execute airtrust-db --file $OUTPUT_FILE"
  exit 1
fi

echo ""
echo "🎉 Production data sync complete!"
