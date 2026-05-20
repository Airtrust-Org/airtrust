#!/bin/bash
# purge-qualificacoes-cascade.sh
# Remove permanentemente registros soft-deleted de qualificacoes_historico
# e suas dependências em cascata

set -e

cd "/Users/filipedaumas/Documents/airtrust v1/worker-airtrust"

echo "🔍 STEP 1: Verificando estado ANTES do purge"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deletados FROM qualificacoes_historico"
echo ""

echo "🔍 STEP 2: Verificando dependências (notificacoes_config)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) as total FROM notificacoes_config WHERE qualificacao_historico_id IN (SELECT id FROM qualificacoes_historico WHERE deleted_at IS NOT NULL)"
echo ""

echo "🔍 STEP 3: Verificando dependências (reclass_queue)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) as total FROM reclass_queue WHERE historico_id IN (SELECT id FROM qualificacoes_historico WHERE deleted_at IS NOT NULL)" 2>/dev/null || echo "Tabela reclass_queue não existe (OK)"
echo ""

echo "🗑️  STEP 4: Deletando dependências em notificacoes_config"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="DELETE FROM notificacoes_config WHERE qualificacao_historico_id IN (SELECT id FROM qualificacoes_historico WHERE deleted_at IS NOT NULL)"
echo ""

echo "🗑️  STEP 5: Deletando dependências em reclass_queue (se existir)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="DELETE FROM reclass_queue WHERE historico_id IN (SELECT id FROM qualificacoes_historico WHERE deleted_at IS NOT NULL)" 2>/dev/null || echo "Tabela reclass_queue não existe (OK)"
echo ""

echo "🗑️  STEP 6: HARD DELETE - qualificacoes_historico soft-deleted"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="DELETE FROM qualificacoes_historico WHERE deleted_at IS NOT NULL"
echo ""

echo "✅ STEP 7: Verificando estado DEPOIS do purge"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
wrangler d1 execute airtrust-db --env production --remote \
  --command="SELECT COUNT(*) as total, SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as deletados FROM qualificacoes_historico"
echo ""

echo "🎉 PURGE COMPLETO!"
echo ""
echo "📊 PRÓXIMO PASSO: Executar VACUUM para recuperar espaço físico"
echo "   Comando: wrangler d1 execute airtrust-db --env production --remote --command='VACUUM'"
