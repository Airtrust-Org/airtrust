#!/bin/bash

# Test script for the 2-step cleanup-incorrect endpoint
# This tests the new safe cleanup with preview → confirm flow

set -e

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
ADMIN_TOKEN="seu_token_admin_aqui"

echo "=========================================="
echo "🧪 Testing 2-Step Cleanup Endpoint"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# STEP 1: PREVIEW (confirma_limpeza=false)
echo -e "${BLUE}📋 STEP 1: Preview - Get list of certificates to be cleaned${NC}"
echo "Sending: POST /api/v2/certificados/admin/cleanup-incorrect"
echo "  Body: { \"confirma_limpeza\": false }"
echo ""

PREVIEW_RESPONSE=$(curl -s -X POST \
  "${API_URL}/api/v2/certificados/admin/cleanup-incorrect" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"confirma_limpeza": false}')

echo -e "${GREEN}Response:${NC}"
echo "$PREVIEW_RESPONSE" | jq '.' 2>/dev/null || echo "$PREVIEW_RESPONSE"
echo ""

# Extract info from preview
TOTAL_COUNT=$(echo "$PREVIEW_RESPONSE" | jq '.total_count // 0')
AFFECTED_COUNT=$(echo "$PREVIEW_RESPONSE" | jq '.affected_funcionarios_count // 0')

if [ "$TOTAL_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No certificates found to clean${NC}"
  echo ""
  exit 0
fi

echo -e "${GREEN}✓ Preview successful!${NC}"
echo "  - Total certificates: $TOTAL_COUNT"
echo "  - Affected funcionarios: $AFFECTED_COUNT"
echo ""

# Show affected funcionarios
echo -e "${BLUE}Affected Funcionarios:${NC}"
echo "$PREVIEW_RESPONSE" | jq '.affected_funcionarios // []' 2>/dev/null | head -20
echo ""

# STEP 2: CONFIRM (confirma_limpeza=true)
read -p "Do you want to confirm and delete these certificates? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${YELLOW}❌ Cleanup cancelled${NC}"
  exit 0
fi

echo ""
echo -e "${RED}🚨 STEP 2: Confirm - Executing deletion...${NC}"
echo "Sending: POST /api/v2/certificados/admin/cleanup-incorrect"
echo "  Body: { \"confirma_limpeza\": true }"
echo ""

CONFIRM_RESPONSE=$(curl -s -X POST \
  "${API_URL}/api/v2/certificados/admin/cleanup-incorrect" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"confirma_limpeza": true}')

echo -e "${GREEN}Response:${NC}"
echo "$CONFIRM_RESPONSE" | jq '.' 2>/dev/null || echo "$CONFIRM_RESPONSE"
echo ""

# Extract results
SUCCESS=$(echo "$CONFIRM_RESPONSE" | jq '.success // false')
DELETED_DB=$(echo "$CONFIRM_RESPONSE" | jq '.deleted_from_db // 0')
DELETED_R2=$(echo "$CONFIRM_RESPONSE" | jq '.deleted_from_r2 // 0')
DURATION=$(echo "$CONFIRM_RESPONSE" | jq '.duration_ms // 0')

if [ "$SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Cleanup completed successfully!${NC}"
  echo "  - Deleted from DB: $DELETED_DB records"
  echo "  - Deleted from R2: $DELETED_R2 files"
  echo "  - Duration: ${DURATION}ms"
else
  echo -e "${RED}❌ Cleanup failed!${NC}"
fi

echo ""
echo "=========================================="
echo "✨ Test completed!"
echo "=========================================="
