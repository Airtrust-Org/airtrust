#!/bin/bash

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║           AIRTRUST V1 - CRITICAL DATA AUDIT - REAL DATA ONLY           ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
echo ""

DB_BINDING="DB"

# Function to run query and extract result
run_query() {
    local title=$1
    local query=$2
    echo ""
    echo "▶ $title"
    echo "────────────────────────────────────────────────────────────────────"
    wrangler d1 execute "$DB_BINDING" --remote --command "$query" 2>&1 | grep -v "wrangler\|⛅\|────\|──\|🌀\|🚣\|Executed\|query\|remote\|Location:\|database\|local\|your\|remove\|flag" | tail -20
}

# ==================== QUALIFICATIONS ====================
echo ""
echo "📊 QUALIFICATIONS AUDIT"
echo "═════════════════════════════════════════════════════════════════════════"

run_query "1. Total Qualifications (all records)" \
    "SELECT COUNT(*) as total FROM qualificacoes;"

run_query "2. Active Qualifications (deleted_at IS NULL)" \
    "SELECT COUNT(*) as active FROM qualificacoes WHERE deleted_at IS NULL;"

run_query "3. Deleted Qualifications" \
    "SELECT COUNT(*) as deleted FROM qualificacoes WHERE deleted_at IS NOT NULL;"

run_query "4. Sample 5 Qualifications" \
    "SELECT id, nome, codigo FROM qualificacoes WHERE deleted_at IS NULL LIMIT 5;"

# ==================== CATEGORIES ====================
echo ""
echo "📊 CATEGORIES AUDIT"
echo "═════════════════════════════════════════════════════════════════════════"

run_query "1. Total Categories (categorias_qualificacoes)" \
    "SELECT COUNT(*) as total FROM categorias_qualificacoes;"

run_query "2. Active Categories (deleted_at IS NULL)" \
    "SELECT COUNT(*) as active FROM categorias_qualificacoes WHERE deleted_at IS NULL;"

run_query "3. Sample 5 Categories" \
    "SELECT id, nome, codigo FROM categorias_qualificacoes WHERE deleted_at IS NULL LIMIT 5;"

# ==================== SIMULATORS ====================
echo ""
echo "📊 SIMULATORS & MODELS AUDIT"
echo "═════════════════════════════════════════════════════════════════════════"

run_query "1. Total Simulators" \
    "SELECT COUNT(*) as total FROM simuladores;"

run_query "2. Active Simulators (deleted_at IS NULL)" \
    "SELECT COUNT(*) as active FROM simuladores WHERE deleted_at IS NULL;"

run_query "3. Sample Simulators" \
    "SELECT id, nome, codigo FROM simuladores WHERE deleted_at IS NULL LIMIT 5;"

run_query "4. Total Models (modelos_sessao)" \
    "SELECT COUNT(*) as total FROM modelos_sessao;"

run_query "5. Active Models" \
    "SELECT COUNT(*) as active FROM modelos_sessao WHERE deleted_at IS NULL;"

run_query "6. Sample Models" \
    "SELECT id, nome, codigo FROM modelos_sessao WHERE deleted_at IS NULL LIMIT 5;"

# ==================== MANEUVERS ====================
echo ""
echo "📊 MANEUVERS AUDIT"
echo "═════════════════════════════════════════════════════════════════════════"

run_query "1. Total Maneuvers (manobras)" \
    "SELECT COUNT(*) as total FROM manobras;"

run_query "2. Active Maneuvers (deleted_at IS NULL)" \
    "SELECT COUNT(*) as active FROM manobras WHERE deleted_at IS NULL;"

run_query "3. Sample Maneuvers" \
    "SELECT id, nome, codigo FROM manobras WHERE deleted_at IS NULL LIMIT 5;"

# ==================== RELATIONSHIPS ====================
echo ""
echo "📊 RELATIONSHIPS AUDIT"
echo "═════════════════════════════════════════════════════════════════════════"

run_query "1. Simulators with Models" \
    "SELECT COUNT(DISTINCT sm.id) as models_count FROM simuladores s LEFT JOIN modelos_sessao sm ON s.id = sm.simulador_id WHERE s.deleted_at IS NULL;"

run_query "2. Models with Maneuvers" \
    "SELECT COUNT(DISTINCT msm.id) as maneuvers_count FROM modelos_sessao m LEFT JOIN modelo_sessao_manobras msm ON m.id = msm.modelo_id WHERE m.deleted_at IS NULL;"

run_query "3. Categories with Qualifications" \
    "SELECT COUNT(DISTINCT q.id) as qualifications_count FROM categorias_qualificacoes c LEFT JOIN qualificacoes q ON c.id = q.categoria_id WHERE c.deleted_at IS NULL AND q.deleted_at IS NULL;"

# ==================== PERFORMANCE ====================
echo ""
echo "📊 PERFORMANCE DIAGNOSTICS"
echo "═════════════════════════════════════════════════════════════════════════"

run_query "1. Qualifications Query Time" \
    "SELECT COUNT(*) as total FROM qualificacoes WHERE deleted_at IS NULL;"

run_query "2. Simulators with Join Query Time" \
    "SELECT s.id, s.nome, COUNT(m.id) as model_count FROM simuladores s LEFT JOIN modelos_sessao m ON s.id = m.simulador_id AND m.deleted_at IS NULL WHERE s.deleted_at IS NULL GROUP BY s.id LIMIT 5;"

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                      AUDIT COMPLETE                                    ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"
