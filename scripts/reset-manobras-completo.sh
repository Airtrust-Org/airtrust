#!/bin/bash
set -e

DB_NAME="airtrust-db"

echo "🗑️  Apagando TODAS as manobras existentes..."

SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- Desabilitar foreign keys temporariamente
PRAGMA foreign_keys = OFF;

-- PASSO 1: Deletar todos os relacionamentos
DELETE FROM modelos_sessao_manobras;

-- PASSO 2: Deletar todas as manobras
DELETE FROM manobras;

-- PASSO 3: Inserir apenas as manobras únicas da lista fornecida (72 manobras)
INSERT INTO manobras (codigo, nome, descricao, categoria, nivel_dificuldade, created_at, updated_at) VALUES
-- Controle geral & procedimentos básicos
('FLY-BAS-X1', 'Controle geral VFR', 'Controle geral VFR', 'VOO_BASICO', 'BASICO', datetime('now'), datetime('now')),
('FLY-BAS-X2', 'Controle geral IFR', 'Controle geral IFR', 'VOO_BASICO', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('FLY-BAS-X3', 'Hover & taxi', 'Hover & taxi', 'VOO_BASICO', 'BASICO', datetime('now'), datetime('now')),
('FLY-BAS-X4', 'Recuperação atitudes anormais', 'Recuperação atitudes anormais', 'VOO_BASICO', 'AVANCADO', datetime('now'), datetime('now')),
('FLY-BAS-17', 'Autorotação', 'Autorotação', 'VOO_BASICO', 'AVANCADO', datetime('now'), datetime('now')),

-- Procedimentos normais
('OPS-NRM-X1', 'Procedimentos normais', 'Procedimentos normais', 'PROCEDIMENTOS', 'BASICO', datetime('now'), datetime('now')),
('OPS-NRM-X2', 'Decolagens & pousos', 'Decolagens & pousos', 'PROCEDIMENTOS', 'BASICO', datetime('now'), datetime('now')),
('OPS-NRM-X3', 'Circuito de tráfego', 'Circuito de tráfego', 'PROCEDIMENTOS', 'BASICO', datetime('now'), datetime('now')),

-- Aproximações
('OPS-APP-X1', 'Precision approach', 'Precision approach', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('OPS-APP-X2', 'Non-precision approach', 'Non-precision approach', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('OPS-APP-X3', 'Missed approach', 'Missed approach', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('OPS-APP-X4', 'Aproximação grande ângulo', 'Aproximação grande ângulo', 'PROCEDIMENTOS', 'AVANCADO', datetime('now'), datetime('now')),

-- Navegação
('OPS-NAV-X1', 'Navegação FMS & convencional', 'Navegação FMS & convencional', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('OPS-NAV-X2', 'Uso AP & automação', 'Uso AP & automação', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('OPS-NAV-X3', 'Holding pattern', 'Holding pattern', 'PROCEDIMENTOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('OPS-NAV-X4', 'SID & STAR', 'SID & STAR', 'PROCEDIMENTOS', 'AVANCADO', datetime('now'), datetime('now')),

-- Offshore
('OPS-OFF-X1', 'Navegação offshore', 'Navegação offshore', 'PROCEDIMENTOS', 'AVANCADO', datetime('now'), datetime('now')),
('OPS-OFF-X2', 'Aproximação offshore', 'Aproximação offshore', 'PROCEDIMENTOS', 'AVANCADO', datetime('now'), datetime('now')),

-- Warnings - Rotor
('WAR-LOW-29', 'Rotor RPM low', 'Rotor RPM low', 'SISTEMAS_MECANICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-HIG-29', 'Rotor RPM high', 'Rotor RPM high', 'SISTEMAS_MECANICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),

-- Warnings - Engine
('WAR-OUT-15', 'Engine failure', 'Engine failure', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-EEC-18', 'EEC failure', 'EEC failure', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-IDL-16', 'Engine stuck IDLE', 'Engine stuck IDLE', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-OIL-18', 'Oil pressure low', 'Oil pressure low', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),

-- Warnings - Electrical
('WAR-GEN-11', 'Dual DC GEN failure', 'Dual DC GEN failure', 'ELETRICO', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-BAT-14', 'Main battery overheat', 'Main battery overheat', 'ELETRICO', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-AUX-14', 'Aux battery overheat', 'Aux battery overheat', 'ELETRICO', 'INTERMEDIARIO', datetime('now'), datetime('now')),

-- Warnings - Fire & smoke
('WAR-FIR-21', 'Engine fire', 'Engine fire', 'SISTEMAS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-CAB-23', 'Cabin/cockpit smoke', 'Cabin/cockpit smoke', 'SISTEMAS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-BAG-23', 'Baggage fire', 'Baggage fire', 'SISTEMAS', 'AVANCADO', datetime('now'), datetime('now')),

-- Warnings - Outros
('WAR-GER-27', 'Landing gear emergency', 'Landing gear emergency', 'SISTEMAS_MECANICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-MGB-30', 'MGB oil pressure low/temp high', 'MGB oil pressure low/temp high', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-TMP-30', 'MGB oil temp high', 'MGB oil temp high', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-STA-X1', 'Static port obstruction', 'Static port obstruction', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('WAR-TDR-X1', 'Tail rotor drive failure', 'Tail rotor drive failure', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-TCS-X1', 'Tail rotor control failure', 'Tail rotor control failure', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-MRC-X1', 'Main rotor binding', 'Main rotor binding', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('WAR-TRC-X1', 'Tail rotor binding', 'Tail rotor binding', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),

-- Cautions - Powerplant
('CAU-HOT-65', 'Hot start', 'Hot start', 'POWERPLANT', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-CST-59', 'Compressor stall', 'Compressor stall', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-OVS-64', 'Engine overspeed', 'Engine overspeed', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-NGO-63', 'NG overspeed', 'NG overspeed', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-CND-61', 'Compressor no demand', 'Compressor no demand', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-TNF-62', 'Throttle non-follow', 'Throttle non-follow', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-LIC-60', 'OEI limit timer', 'OEI limit timer', 'POWERPLANT', 'INTERMEDIARIO', datetime('now'), datetime('now')),

-- Cautions - Fuel
('CAU-FLO-73', 'Fuel low', 'Fuel low', 'POWERPLANT', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-2FP-74', 'Double fuel pump failure', 'Double fuel pump failure', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-EFP-75', 'Engine fuel pump failure', 'Engine fuel pump failure', 'POWERPLANT', 'AVANCADO', datetime('now'), datetime('now')),

-- Cautions - Electrical
('CAU-DCG-53', 'Single DC GEN failure', 'Single DC GEN failure', 'ELETRICO', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-BOF-55', 'Battery offline', 'Battery offline', 'ELETRICO', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-DCB-56', 'DC bus failure', 'DC bus failure', 'ELETRICO', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-ACB-57', 'AC bus failure', 'AC bus failure', 'ELETRICO', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-28D-58', '28V DC failure', '28V DC failure', 'ELETRICO', 'AVANCADO', datetime('now'), datetime('now')),

-- Cautions - Hydraulic
('CAU-HYP-77', 'Hydraulic pressure low', 'Hydraulic pressure low', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-SRV-80', 'Servo bypass', 'Servo bypass', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),

-- Cautions - Avionics
('CAU-ADS-46', 'ADS failure', 'ADS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-AHR-47', 'AHRS failure', 'AHRS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-DUD-46', 'Display unit degraded', 'Display unit degraded', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-PFD-45', 'PFD failure', 'PFD failure', 'AVIONICOS', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-MFD-45', 'MFD failure', 'MFD failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-EIC-45', 'EICAS failure', 'EICAS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-ADC-48', 'ADC failure', 'ADC failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-GPS-52', 'GPS failure', 'GPS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-FMS-51', 'FMS failure', 'FMS failure', 'AVIONICOS', 'INTERMEDIARIO', datetime('now'), datetime('now')),

-- Cautions - AFCS
('CAU-APO-38', 'AP OFF', 'AP OFF', 'AFCS', 'BASICO', datetime('now'), datetime('now')),
('CAU-APF-37', 'AP failure', 'AP failure', 'AFCS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-MIS-40', 'AP MISTRIM', 'AP MISTRIM', 'AFCS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-SAS-41', 'SAS degraded', 'SAS degraded', 'AFCS', 'INTERMEDIARIO', datetime('now'), datetime('now')),
('CAU-AFD-41', 'AFCS degraded', 'AFCS degraded', 'AFCS', 'INTERMEDIARIO', datetime('now'), datetime('now')),

-- Cautions - Transmission & outros
('CAU-MGP-105', 'MGB chip detected', 'MGB chip detected', 'SISTEMAS_MECANICOS', 'AVANCADO', datetime('now'), datetime('now')),
('CAU-O2P-82', 'O2 pressure low', 'O2 pressure low', 'SISTEMAS', 'INTERMEDIARIO', datetime('now'), datetime('now'));

-- Verificar criação
SELECT COUNT(*) as total_manobras_criadas FROM manobras;

-- Reabilitar foreign keys
PRAGMA foreign_keys = ON;
EOF

echo "📤 Aplicando ao banco remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$SQL_FILE"

rm "$SQL_FILE"

echo "✅ Reset completo! 72 manobras criadas."
