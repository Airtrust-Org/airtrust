#!/bin/bash
# Cleanup script - Remove duplicate, obsolete, and consolidated files
# Generated: 2025-11-02
# Purpose: Clean up src/worker/api/v2/ from 60 files to ~14 core modules

set -e

BACKUP_DIR="_backups/cleanup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "🔄 Starting cleanup..."
echo "📂 Backup directory: $BACKUP_DIR"

# ===================================================================
# PHASE 1: Remove already consolidated files
# ===================================================================

echo "📋 PHASE 1: Remove consolidated certificados files"
rm -v src/worker/api/v2/certificados-download.ts || true
rm -v src/worker/api/v2/certificados-storage.ts || true
rm -v src/worker/api/v2/certificados-refactored.ts || true
rm -v src/worker/api/v2/certificados-download-historico.ts || true
rm -v src/worker/api/v2/historico-certificacoes.ts || true
rm -v src/worker/api/v2/import-certificacoes.ts || true
rm -v src/worker/api/v2/import-certificacoes-batch.ts || true
rm -v src/worker/api/v2/pasta-virtual-certificados-enhanced.ts || true

# ===================================================================
# PHASE 2: Remove duplicate/enhanced versions (merge into main)
# ===================================================================

echo "📋 PHASE 2: Remove -enhanced, -v2, -old versions"
rm -v src/worker/api/v2/pasta-virtual-download.ts || true
rm -v src/worker/api/v2/funcionarios-batch.ts || true
rm -v src/worker/api/v2/simulador-fichas-crud.ts || true
rm -v src/worker/api/v2/treinamentos-sessoes.ts || true
rm -v src/worker/api/v2/treinamentos-public.ts || true
rm -v src/worker/api/v2/fichas-pdf.ts || true
rm -v src/worker/api/v2/fichas-assinatura.ts || true
rm -v src/worker/api/v2/fichas-avaliacao.ts || true
rm -v src/worker/api/v2/manobras-avaliar.ts || true
rm -v src/worker/api/v2/categorias-manobras.ts || true
rm -v src/worker/api/v2/categorias-qualificacoes.ts || true
rm -v src/worker/api/v2/exames-crud.ts || true
rm -v src/worker/api/v2/compliance-dashboard.ts || true

# ===================================================================
# PHASE 3: Remove import/type files (merge into main modules)
# ===================================================================

echo "📋 PHASE 3: Remove -import, -types helper files"
rm -v src/worker/api/v2/qualificacoes-import.ts || true
rm -v src/worker/api/v2/qualificacoes-upload-alias.ts || true
rm -v src/worker/api/v2/tipos-qualificacoes-import.ts || true
rm -v src/worker/api/v2/import.ts || true
rm -v src/worker/api/v2/import-manobras.ts || true
rm -v src/worker/api/v2/relacoes-import-inteligente.ts || true

# ===================================================================
# PHASE 4: Remove utility/template files (consolidate or archive)
# ===================================================================

echo "📋 PHASE 4: Remove utility/template files"
rm -v src/worker/api/v2/pdf-generator-fichas.ts || true
rm -v src/worker/api/v2/fichas-pdf-storage.ts || true
rm -v src/worker/api/v2/templates-airtrust.ts || true
rm -v src/worker/api/v2/sessoes-template-public.ts || true

# ===================================================================
# PHASE 5: Remove split/partial implementations
# ===================================================================

echo "📋 PHASE 5: Remove split/partial files"
rm -v src/worker/api/v2/simulador-slots.ts || true
rm -v src/worker/api/v2/simuladores-modelos.ts || true
rm -v src/worker/api/v2/auditoria-datas-completa.ts || true
rm -v src/worker/api/v2/lgpd-safe.ts || true
rm -v src/worker/api/v2/alertas.ts || true
rm -v src/worker/api/v2/dashboard-stats.ts || true
rm -v src/worker/api/v2/checks.ts || true
rm -v src/worker/api/v2/funcionarios-search.ts || true
rm -v src/worker/api/v2/funcionarios-advanced.ts || true
rm -v src/worker/api/v2/pasta-virtual-listar.ts || true
rm -v src/worker/api/v2/pasta-virtual-stats.ts || true
rm -v src/worker/api/v2/agendamentos.ts || true
rm -v src/worker/api/v2/catalogo-treinamentos.ts || true

# ===================================================================
# SUMMARY
# ===================================================================

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📊 Files remaining:"
ls -1 src/worker/api/v2/*.ts | wc -l
echo ""
echo "📝 Remaining modules:"
ls -1 src/worker/api/v2/*.ts | xargs -n1 basename | sort
