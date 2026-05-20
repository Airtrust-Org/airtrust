#!/bin/bash

DB="DB"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         AIRTRUST V1 - CRITICAL DATA AUDIT REPORT              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "📊 1. QUALIFICATIONS DATA"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT COUNT(*) as total_qualifications, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_qualifications FROM qualificacoes;" 2>&1 | grep -E "total|active" | head -10

echo ""
echo "📊 2. CATEGORIES DATA"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT COUNT(*) as total_categories, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_categories FROM categorias_qualificacoes;" 2>&1 | grep -E "total|active" | head -10

echo ""
echo "📊 3. SIMULATORS DATA"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT COUNT(*) as total_simulators, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_simulators FROM simuladores;" 2>&1 | grep -E "total|active" | head -10

echo ""
echo "📊 4. MODELS DATA"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT COUNT(*) as total_models, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_models FROM modelos_sessao;" 2>&1 | grep -E "total|active" | head -10

echo ""
echo "📊 5. MANEUVERS DATA"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT COUNT(*) as total_maneuvers, COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active_maneuvers FROM manobras;" 2>&1 | grep -E "total|active" | head -10

echo ""
echo "📊 6. SAMPLE QUALIFICATIONS"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT id, nome, codigo, categoria FROM qualificacoes WHERE deleted_at IS NULL LIMIT 3;" 2>&1 | tail -20

echo ""
echo "📊 7. SAMPLE CATEGORIES"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT id, nome, codigo FROM categorias_qualificacoes WHERE deleted_at IS NULL LIMIT 3;" 2>&1 | tail -20

echo ""
echo "📊 8. SAMPLE SIMULATORS"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT id, nome, modelo, status FROM simuladores WHERE deleted_at IS NULL LIMIT 3;" 2>&1 | tail -20

echo ""
echo "📊 9. SAMPLE MODELS"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT id, codigo, nome FROM modelos_sessao WHERE deleted_at IS NULL LIMIT 3;" 2>&1 | tail -20

echo ""
echo "📊 10. SAMPLE MANEUVERS"
echo "───────────────────────────────────────────────────────────────"
wrangler d1 execute $DB --remote --command "SELECT id, codigo, nome, categoria FROM manobras WHERE deleted_at IS NULL LIMIT 3;" 2>&1 | tail -20

echo ""
echo "✅ AUDIT COMPLETE"
