#!/bin/bash
set -euo pipefail

# Smart import: use production schema for missing tables, then import all data

echo "🧠 Smart import strategy:"
echo "1. Get production schema"
echo "2. Apply missing tables to local"
echo "3. Import all data"

cd "/Users/filipedaumas/Documents/airtrust v1"

# Get fresh full export from production
echo ""
echo "📤 Exporting full schema + data from production..."
npx wrangler d1 export airtrust-db --remote --output ./migrations/data-export/prod_fresh_full.sql 2>&1 | grep -E "Downloaded|Error" || true

echo ""
echo "🔧 Processing export..."

# Create import with:
# 1. All CREATE TABLE IF NOT EXISTS statements
# 2. All INSERT statements (with INSERT OR REPLACE to handle conflicts)
# 3. PRAGMA statements from production

cat > ./migrations/data-export/final_import.sql << 'FINAL_IMPORT'
PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = TRUE;

FINAL_IMPORT

# Get all CREATE TABLE and ALTER TABLE statements
grep -E "^(CREATE TABLE|ALTER TABLE)" ./migrations/data-export/prod_fresh_full.sql \
  | sed 's/^CREATE TABLE/CREATE TABLE IF NOT EXISTS/g' \
  >> ./migrations/data-export/final_import.sql

# Get all INSERT statements and convert to INSERT OR REPLACE
grep "^INSERT INTO" ./migrations/data-export/prod_fresh_full.sql \
  | sed 's/^INSERT INTO/INSERT OR REPLACE INTO/g' \
  >> ./migrations/data-export/final_import.sql

cat >> ./migrations/data-export/final_import.sql << 'FINAL_IMPORT_END'

PRAGMA foreign_keys = ON;
PRAGMA defer_foreign_keys = FALSE;

FINAL_IMPORT_END

echo "✅ Created: ./migrations/data-export/final_import.sql"
wc -l ./migrations/data-export/final_import.sql

echo ""
echo "📥 Importing to local..."
npx wrangler d1 execute airtrust-db --local --file ./migrations/data-export/final_import.sql 2>&1 | tail -30

