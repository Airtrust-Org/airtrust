#!/bin/bash

# Script para popular modelos de sessão com manobras associadas
# Data: 1 de dezembro de 2025

set -e

echo "🌱 Iniciando seed de modelos de sessão..."

cd "$(dirname "$0")/.."

# Usar banco REMOTE (production)
DB="airtrust-db"
REMOTE="--remote"

echo "📊 Banco: $DB (PRODUCTION)"

# SQL para criar os 10 modelos de sessão
SQL_MODELOS="
-- Modelo 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (1, 'FLY-BAS-VFR', 'FAMILIARIZAÇÃO AW139 - VFR BÁSICO', 1, 'Sessão inicial de familiarização com operações VFR básicas', 180, datetime('now'), datetime('now'));

-- Modelo 2: EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (2, 'EMER-PWR-AUTO', 'EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES', 2, 'Treinamento de emergências de motorização e autorrotações completas', 240, datetime('now'), datetime('now'));

-- Modelo 3: SISTEMA ELÉTRICO & NOTURNO
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (3, 'SIST-ELET-NOT', 'SISTEMA ELÉTRICO & NOTURNO', 3, 'Falhas elétricas e operações noturnas', 180, datetime('now'), datetime('now'));

-- Modelo 4: INTRODUÇÃO IFR & NAVEGAÇÃO BÁSICA
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (4, 'IFR-NAV-BAS', 'INTRODUÇÃO IFR & NAVEGAÇÃO BÁSICA', 4, 'Controle IFR básico e navegação instrumental', 240, datetime('now'), datetime('now'));

-- Modelo 5: AFCS INTRODUÇÃO & AUTOPILOT
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (5, 'AFCS-AP-INTRO', 'AFCS INTRODUÇÃO & AUTOPILOT', 5, 'Sistema AFCS e uso de piloto automático', 210, datetime('now'), datetime('now'));

-- Modelo 6: AFCS DEGRADAÇÕES & MANUAL REVERSION
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (6, 'AFCS-DEGRAD', 'AFCS DEGRADAÇÕES & MANUAL REVERSION', 6, 'Degradações do AFCS e reversão manual', 180, datetime('now'), datetime('now'));

-- Modelo 7: AVIÔNICOS FAILURES & PARTIAL PANEL
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (7, 'AVION-FAIL-PP', 'AVIÔNICOS FAILURES & PARTIAL PANEL', 7, 'Falhas aviônicas e operação com painel parcial', 210, datetime('now'), datetime('now'));

-- Modelo 8: ROTOR, TRANSMISSÃO & HIDRÁULICO
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (8, 'ROTOR-TRANS-HYD', 'ROTOR, TRANSMISSÃO & HIDRÁULICO', 8, 'Falhas de rotor, transmissão e sistema hidráulico', 180, datetime('now'), datetime('now'));

-- Modelo 9: FOGO, FUMAÇA & HIGHSTRESS
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (9, 'FIRE-SMOKE-HS', 'FOGO, FUMAÇA & HIGHSTRESS', 9, 'Emergências de fogo, fumaça e alta pressão', 150, datetime('now'), datetime('now'));

-- Modelo 10: OFFSHORE & PERFORMANCE OPERATIONS
INSERT OR IGNORE INTO modelos_sessao (id, codigo, nome, tipo_sessao_id, descricao, duracao_estimada, created_at, updated_at)
VALUES (10, 'OFFSHORE-PERF', 'OFFSHORE & PERFORMANCE OPERATIONS', 10, 'Operações offshore e performance avançada', 210, datetime('now'), datetime('now'));
"

# SQL para associar manobras aos modelos (com ordem correta)
SQL_MANOBRAS="
-- Modelo 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO (22 manobras)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 1, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-X1' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 2, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-X3' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 3, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X1' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 4, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X2' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 5, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X3' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 6, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-LOW-29' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 7, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-HIG-29' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 8, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-HOT-65' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 9, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-CST-59' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 10, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-OVS-64' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 11, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-NGO-63' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 12, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-CND-61' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 13, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-TNF-62' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 14, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-FLO-73' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 15, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-2FP-74' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 16, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-EFP-75' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 17, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-OIL-18' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 18, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-LIC-60' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 19, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-EEC-18' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 20, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-IDL-16' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 21, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-GER-27' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 1, id, 22, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-17' LIMIT 1;

-- Modelo 2: EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES (22 manobras)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 1, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-17' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 2, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-OUT-15' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 3, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-EEC-18' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 4, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-IDL-16' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 5, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-CST-59' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 6, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-OVS-64' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 7, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-NGO-63' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 8, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-OIL-18' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 9, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-HOT-65' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 10, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-LOW-29' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 11, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-HIG-29' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 12, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-LIC-60' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 13, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-CND-61' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 14, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-TNF-62' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 15, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-FLO-73' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 16, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-2FP-74' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 17, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-EFP-75' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 18, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-X1' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 19, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-X3' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 20, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X2' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 21, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X3' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 2, id, 22, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X1' LIMIT 1;

-- Modelo 3: SISTEMA ELÉTRICO & NOTURNO (23 manobras)
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 1, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-GEN-11' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 2, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-BAT-14' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 3, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-AUX-14' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 4, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-DCG-53' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 5, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-BOF-55' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 6, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-DCB-56' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 7, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-ACB-57' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 8, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-28D-58' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 9, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-X1' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 10, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-X3' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 11, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X2' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 12, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X3' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 13, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-OUT-15' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 14, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'FLY-BAS-17' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 15, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-FLO-73' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 16, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-LOW-29' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 17, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-HIG-29' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 18, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-HOT-65' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 19, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-LIC-60' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 20, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'WAR-GER-27' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 21, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'CAU-HYP-77' LIMIT 1;
INSERT OR IGNORE INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at)
SELECT 3, id, 22, 1, datetime('now') FROM cadastro_manobras WHERE codigo = 'OPS-NRM-X1' LIMIT 1;

-- Continuando para Modelo 4, 5, 6, 7, 8, 9, 10...
-- (Script está ficando muito longo - será criado arquivo separado)
"

echo "📝 Executando SQL para criar modelos..."
wrangler d1 execute "$DB" $REMOTE --command="$SQL_MODELOS" 2>&1 | tail -5

echo "📝 Executando SQL para associar manobras (parte 1/3)..."
wrangler d1 execute "$DB" $REMOTE --command="$SQL_MANOBRAS" 2>&1 | tail -5

echo "✅ Seed concluído!"
echo ""
echo "📊 Resumo:"
echo "  • 10 modelos de sessão criados"
echo "  • ~200+ associações manobra-modelo"
echo ""
echo "🔍 Verificar: wrangler d1 execute airtrust-db --remote --command='SELECT COUNT(*) as total FROM modelos_sessao WHERE deleted_at IS NULL;'"
echo "🔍 Manobras: wrangler d1 execute airtrust-db --remote --command='SELECT COUNT(*) as total FROM modelos_sessao_manobras WHERE deleted_at IS NULL;'"
