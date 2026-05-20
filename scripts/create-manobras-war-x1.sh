#!/bin/bash
set -e

DB_NAME="airtrust-db"

echo "🔄 Criando manobras WAR faltantes..."

SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- WAR manobras faltantes (genéricas X1)
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at, updated_at) VALUES
('WAR-STA-X1', 'Static port obstruction', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-TDR-X1', 'Turbine door release', 'SISTEMAS_MECANICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-TCS-X1', 'TCS malfunction', 'AFCS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-MRC-X1', 'Main rotor chip detected', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-TRC-X1', 'Tail rotor chip detected', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now'));

-- Verificar criação
SELECT COUNT(*) as total_criadas FROM manobras WHERE codigo LIKE 'WAR-%-X1';
EOF

echo "📤 Aplicando ao banco remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$SQL_FILE"

rm "$SQL_FILE"

echo "✅ Manobras WAR-X1 criadas com sucesso!"
