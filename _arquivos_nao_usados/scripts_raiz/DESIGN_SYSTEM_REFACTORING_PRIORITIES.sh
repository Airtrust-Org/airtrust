#!/bin/bash
# Design System Refactoring - Priority Implementation Guide
# Refactor remaining pages with PageLayout, design tokens, and consistent styling

# PHASE 2: Core Management Pages
# These pages handle critical business data and need design system compliance

# 1. Habilitacoes.tsx - Qualifications management (high impact)
# Action: Convert to PageLayout with tabs using consistent card styling
# Key changes:
#   - Wrap in PageLayout with title/subtitle
#   - Convert tab buttons to use consistent styling
#   - Use PageGrid for list layouts
#   - Replace inline gray-200 borders with neutral-200
#   - Update status badge colors with statusColors token
#   - Standardize card padding to md (p-6) or sm (p-4)

# 2. Manobras.tsx - Maneuvers list
# Action: Convert to PageLayout with data table styling
# Key changes:
#   - Wrap in PageLayout
#   - Table header should use neutral-100 background
#   - Table rows use hover:bg-neutral-50
#   - Replace gray colors with neutral scale
#   - Use consistent spacing for table cells

# 3. Treinamentos.tsx - Training management
# Action: Convert to PageLayout with training overview
# Key changes:
#   - Wrap in PageLayout
#   - Use PageGrid for stat cards
#   - Convert training list to PageCard items
#   - Use status badges for training status

# PHASE 3: Secondary Management Pages  
# These pages manage supporting data like companies, functions, aircraft

# 4. Empresas.tsx - Company management
# 5. Funcoes.tsx - Functions management
# 6. Aeronaves.tsx - Aircraft management
# 7. Certificacoes.tsx - Certificate management

# PHASE 4: Utility Pages
# These pages provide system functions and configuration

# 8. Sistema.tsx - System settings
# 9. Configuracoes.tsx - App configuration
# 10. Others: Reports, Audit, Backup

# IMPLEMENTATION PRIORITIES (Score based on impact x effort)

# 🔴 CRITICAL (Do first - high impact, medium effort)
# 1. Habilitacoes.tsx - Core business domain
# 2. Manobras.tsx - Core business domain
# 3. Empresas.tsx - Master data

# 🟡 HIGH (Do second - medium impact, medium effort)
# 4. Treinamentos.tsx
# 5. Certificacoes.tsx
# 6. Funcoes.tsx

# 🟢 MEDIUM (Do third - lower priority)
# 7. Sistema.tsx
# 8. AuditoriaDatas.tsx
# 9. BackupRestore.tsx

# 🔵 LOW (Do last if time permits)
# 10-40. Dashboard pages, sub-pages, modals

echo "✅ Refactoring Guide Ready"
echo ""
echo "Next Steps:"
echo "1. Run: npm run dev (to test in real-time)"
echo "2. Refactor pages in priority order"
echo "3. Test each page in dev mode"
echo "4. Run: npm run build (after each page group)"
echo "5. Run: wrangler deploy (when all complete)"
