#!/bin/bash
set -e

# Script para criar TODAS as manobras necessárias para os modelos
# Data: 1 de dezembro de 2025

DB_NAME="airtrust-db"

echo "🔄 Criando manobras faltantes para os modelos de sessão..."

# Criar arquivo SQL temporário
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- Inserir todas as manobras necessárias (INSERT OR IGNORE para não duplicar)

-- Powerplant / Fuel
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-2FP-74', 'Double fuel pump failure', 'POWERPLANT', 'AVANCADO', datetime('now')),
('CAU-EFP-75', 'Engine fuel pump failure', 'POWERPLANT', 'AVANCADO', datetime('now'));

-- Electrical
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-BOF-55', 'Battery offline', 'ELETRICO', 'INTERMEDIARIO', datetime('now')),
('CAU-DCB-56', 'DC bus failure', 'ELETRICO', 'AVANCADO', datetime('now')),
('CAU-ACB-57', 'AC bus failure', 'ELETRICO', 'AVANCADO', datetime('now')),
('CAU-28D-58', '28V DC failure', 'ELETRICO', 'AVANCADO', datetime('now'));

-- Hydraulics
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-SRV-80', 'Servo bypass', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'));

-- Avionics
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-ADS-46', 'ADS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now')),
('CAU-AHR-47', 'AHRS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now')),
('CAU-DUD-46', 'Display unit degraded', 'AVIONICOS', 'INTERMEDIARIO', datetime('now')),
('CAU-PFD-45', 'PFD failure', 'AVIONICOS', 'AVANCADO', datetime('now')),
('CAU-MFD-45', 'MFD failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now')),
('CAU-EIC-45', 'EICAS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'));

-- AFCS
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-APO-38', 'AP OFF', 'AFCS', 'BASICO', datetime('now')),
('CAU-APF-37', 'AP failure', 'AFCS', 'INTERMEDIARIO', datetime('now')),
('CAU-MIS-40', 'AP MISTRIM', 'AFCS', 'INTERMEDIARIO', datetime('now')),
('CAU-SAS-41', 'SAS degraded', 'AFCS', 'INTERMEDIARIO', datetime('now')),
('CAU-AFD-41', 'AFCS degraded', 'AFCS', 'INTERMEDIARIO', datetime('now'));

-- Transmission / MGB
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-MGP-105', 'MGB chip detected', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'));

-- Oxygen
INSERT OR IGNORE INTO manobras (codigo, descricao, categoria, nivel_dificuldade, created_at) VALUES
('CAU-O2P-82', 'O2 pressure low', 'SISTEMAS', 'INTERMEDIARIO', datetime('now'));

-- Verificar manobras criadas
SELECT COUNT(*) as total_criadas FROM manobras 
WHERE codigo IN (
  'CAU-2FP-74', 'CAU-EFP-75', 'CAU-BOF-55', 'CAU-DCB-56', 'CAU-ACB-57', 'CAU-28D-58',
  'CAU-SRV-80', 'CAU-ADS-46', 'CAU-AHR-47', 'CAU-DUD-46', 'CAU-PFD-45', 'CAU-MFD-45',
  'CAU-EIC-45', 'CAU-APO-38', 'CAU-APF-37', 'CAU-MIS-40', 'CAU-SAS-41', 'CAU-AFD-41',
  'CAU-MGP-105', 'CAU-O2P-82'
);
EOF

echo "📤 Aplicando ao banco remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$SQL_FILE"

echo "🧹 Limpando arquivo temporário..."
rm "$SQL_FILE"

echo "✅ Manobras complementares criadas com sucesso!"
