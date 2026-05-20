#!/bin/bash
set -e

# Script para criar manobras genéricas (X) necessárias
# Data: 1 de dezembro de 2025

DB_NAME="airtrust-db"

echo "🔄 Criando manobras genéricas faltantes..."

# Criar arquivo SQL temporário
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- Inserir manobras X que não existem

-- Flying manobras gerais
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('FLY-BAS-X1', 'Controle geral VFR', 'VOO_BASICO', 'BASICO', datetime('now')),
('FLY-BAS-X2', 'Controle geral IFR', 'VOO_BASICO', 'INTERMEDIARIO', datetime('now')),
('FLY-BAS-X3', 'Hover & taxi', 'VOO_BASICO', 'BASICO', datetime('now')),
('FLY-BAS-X4', 'Recuperação atitudes anormais', 'VOO_BASICO', 'AVANCADO', datetime('now'));

-- Operations manobras gerais
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('OPS-NRM-X1', 'Procedimentos normais', 'PROCEDIMENTOS', 'BASICO', datetime('now')),
('OPS-NRM-X2', 'Decolagens & pousos', 'PROCEDIMENTOS', 'BASICO', datetime('now')),
('OPS-NRM-X3', 'Circuito de tráfego', 'PROCEDIMENTOS', 'BASICO', datetime('now')),
('OPS-APP-X1', 'Precision approach', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-APP-X2', 'Non-precision approach', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-APP-X3', 'Missed approach', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-APP-X4', 'Aproximação grande ângulo', 'PROCEDIMENTOS', 'AVANCADO', datetime('now')),
('OPS-NAV-X1', 'Navegação FMS & convencional', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-NAV-X2', 'Uso AP & automação', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-NAV-X3', 'Holding pattern', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-NAV-X4', 'SID & STAR', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now')),
('OPS-OFF-X1', 'Navegação offshore', 'PROCEDIMENTOS', 'AVANCADO', datetime('now')),
('OPS-OFF-X2', 'Aproximação offshore', 'PROCEDIMENTOS', 'AVANCADO', datetime('now'));

-- Warning manobras gerais
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('WAR-STA-X1', 'Static port obstruction', 'AVIONICOS', 'INTERMEDIARIO', datetime('now')),
('WAR-TDR-X1', 'Tail rotor drive failure', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now')),
('WAR-TCS-X1', 'Tail rotor control failure', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now')),
('WAR-MRC-X1', 'Main rotor binding', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now')),
('WAR-TRC-X1', 'Tail rotor binding', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'));

-- Verificar manobras criadas
SELECT codigo, descricao FROM manobras WHERE codigo LIKE '%X%' ORDER BY codigo;
EOF

echo "📤 Aplicando ao banco remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$SQL_FILE"

echo "🧹 Limpando arquivo temporário..."
rm "$SQL_FILE"

echo "✅ Manobras genéricas criadas com sucesso!"
