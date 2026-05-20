#!/bin/bash
set -e

# Script para popular manobras nos modelos de sessão
# Data: 1 de dezembro de 2025

DB_NAME="airtrust-db"

echo "🔄 Populando manobras nos modelos de sessão..."

# Criar arquivo SQL temporário
SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- Limpar manobras existentes dos modelos 1-10
DELETE FROM modelos_sessao_manobras WHERE modelo_id BETWEEN 16 AND 25;

-- SESSÃO 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO (ID 16)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(16, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 1, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 2, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 3, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 4, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3' LIMIT 1), 5, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 6, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 7, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 8, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-CST-59' LIMIT 1), 9, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-OVS-64' LIMIT 1), 10, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-NGO-63' LIMIT 1), 11, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-CND-61' LIMIT 1), 12, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-TNF-62' LIMIT 1), 13, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 14, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-2FP-74' LIMIT 1), 15, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-EFP-75' LIMIT 1), 16, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-OIL-18' LIMIT 1), 17, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 18, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-EEC-18' LIMIT 1), 19, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-IDL-16' LIMIT 1), 20, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-GER-27' LIMIT 1), 21, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 2: EMERGÊNCIAS POWERPLANT (ID 17)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(17, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 1, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 2, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-EEC-18' LIMIT 1), 3, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-IDL-16' LIMIT 1), 4, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-CST-59' LIMIT 1), 5, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-OVS-64' LIMIT 1), 6, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-NGO-63' LIMIT 1), 7, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-OIL-18' LIMIT 1), 8, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 9, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 10, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 11, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 12, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-CND-61' LIMIT 1), 13, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-TNF-62' LIMIT 1), 14, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 15, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-2FP-74' LIMIT 1), 16, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-EFP-75' LIMIT 1), 17, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 18, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 19, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 20, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3' LIMIT 1), 21, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 3: SISTEMA ELÉTRICO (ID 18)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(18, (SELECT id FROM manobras WHERE codigo='WAR-GEN-11' LIMIT 1), 1, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-BAT-14' LIMIT 1), 2, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-AUX-14' LIMIT 1), 3, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-DCG-53' LIMIT 1), 4, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-BOF-55' LIMIT 1), 5, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-DCB-56' LIMIT 1), 6, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-ACB-57' LIMIT 1), 7, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-28D-58' LIMIT 1), 8, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 9, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 10, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 11, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3' LIMIT 1), 12, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 13, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 14, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 15, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 16, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 17, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 18, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 19, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-GER-27' LIMIT 1), 20, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-HYP-77' LIMIT 1), 21, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 4: IFR & NAVEGAÇÃO (ID 19)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 1, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 2, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2' LIMIT 1), 3, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3' LIMIT 1), 4, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1' LIMIT 1), 5, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X3' LIMIT 1), 6, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4' LIMIT 1), 7, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 8, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 9, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 10, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 11, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 12, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 13, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 14, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 15, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 16, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1' LIMIT 1), 17, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-ADC-48' LIMIT 1), 18, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-GPS-52' LIMIT 1), 19, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-FMS-51' LIMIT 1), 20, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 21, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 5: AFCS & AUTOPILOT (ID 20)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2' LIMIT 1), 1, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 2, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 3, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3' LIMIT 1), 4, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-APO-38' LIMIT 1), 5, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1' LIMIT 1), 6, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X3' LIMIT 1), 7, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X4' LIMIT 1), 8, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2' LIMIT 1), 9, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4' LIMIT 1), 10, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 11, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 12, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 13, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 14, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 15, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 16, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 17, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 18, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 19, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1' LIMIT 1), 20, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-GPS-52' LIMIT 1), 21, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-FMS-51' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 6: AFCS DEGRADAÇÕES (ID 21)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(21, (SELECT id FROM manobras WHERE codigo='CAU-APF-37' LIMIT 1), 1, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-MIS-40' LIMIT 1), 2, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-SAS-41' LIMIT 1), 3, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-AFD-41' LIMIT 1), 4, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 5, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 6, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3' LIMIT 1), 7, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2' LIMIT 1), 8, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4' LIMIT 1), 9, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 10, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 11, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1' LIMIT 1), 12, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X3' LIMIT 1), 13, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 14, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 15, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 16, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 17, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 18, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 19, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 20, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2' LIMIT 1), 21, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 7: AVIÔNICOS FAILURES (ID 22)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(22, (SELECT id FROM manobras WHERE codigo='CAU-ADS-46' LIMIT 1), 1, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-AHR-47' LIMIT 1), 2, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-DUD-46' LIMIT 1), 3, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-PFD-45' LIMIT 1), 4, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-MFD-45' LIMIT 1), 5, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-EIC-45' LIMIT 1), 6, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-ADC-48' LIMIT 1), 7, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4' LIMIT 1), 8, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 9, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 10, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2' LIMIT 1), 11, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3' LIMIT 1), 12, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1' LIMIT 1), 13, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2' LIMIT 1), 14, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 15, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 16, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 17, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 18, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 19, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 20, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 21, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 8: ROTOR & TRANSMISSÃO (ID 23)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(23, (SELECT id FROM manobras WHERE codigo='WAR-MGB-30' LIMIT 1), 1, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TMP-30' LIMIT 1), 2, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-MGP-105' LIMIT 1), 3, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TDR-X1' LIMIT 1), 4, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TCS-X1' LIMIT 1), 5, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-MRC-X1' LIMIT 1), 6, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TRC-X1' LIMIT 1), 7, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-HYP-77' LIMIT 1), 8, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-SRV-80' LIMIT 1), 9, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 10, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 11, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 12, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 13, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 14, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-GER-27' LIMIT 1), 15, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 16, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 17, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 18, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 19, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 20, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 21, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 9: FOGO & FUMAÇA (ID 24)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(24, (SELECT id FROM manobras WHERE codigo='WAR-FIR-21' LIMIT 1), 1, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-CAB-23' LIMIT 1), 2, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-BAG-23' LIMIT 1), 3, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-O2P-82' LIMIT 1), 4, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 5, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 6, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 7, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 8, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 9, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 10, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-GER-27' LIMIT 1), 11, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-HYP-77' LIMIT 1), 12, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-SRV-80' LIMIT 1), 13, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 14, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 15, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 16, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 17, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 18, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3' LIMIT 1), 19, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1' LIMIT 1), 20, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4' LIMIT 1), 21, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 22, 1, datetime('now'));

-- SESSÃO 10: OFFSHORE (ID 25)
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(25, (SELECT id FROM manobras WHERE codigo='OPS-OFF-X1' LIMIT 1), 1, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-OFF-X2' LIMIT 1), 2, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-APP-X4' LIMIT 1), 3, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2' LIMIT 1), 4, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1' LIMIT 1), 5, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2' LIMIT 1), 6, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3' LIMIT 1), 7, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1' LIMIT 1), 8, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2' LIMIT 1), 9, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1' LIMIT 1), 10, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73' LIMIT 1), 11, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15' LIMIT 1), 12, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17' LIMIT 1), 13, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-2FP-74' LIMIT 1), 14, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29' LIMIT 1), 15, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29' LIMIT 1), 16, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65' LIMIT 1), 17, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60' LIMIT 1), 18, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-GEN-11' LIMIT 1), 19, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-DCG-53' LIMIT 1), 20, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1' LIMIT 1), 21, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3' LIMIT 1), 22, 1, datetime('now'));

-- Verificar resultado
SELECT 
  ms.id,
  ms.codigo,
  ms.nome,
  COUNT(msm.id) as total_manobras
FROM modelos_sessao ms
LEFT JOIN modelos_sessao_manobras msm ON msm.modelo_id = ms.id AND msm.deleted_at IS NULL
WHERE ms.id BETWEEN 16 AND 25
GROUP BY ms.id
ORDER BY ms.id;
EOF

echo "📤 Aplicando ao banco remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$SQL_FILE"

echo "🧹 Limpando arquivo temporário..."
rm "$SQL_FILE"

echo "✅ Manobras populadas com sucesso!"
echo ""
echo "📊 Resumo:"
echo "  • Modelo 1 (FAMILIARIZAÇÃO): 22 manobras"
echo "  • Modelo 2 (EMERGÊNCIAS): 22 manobras"
echo "  • Modelo 3 (SISTEMA ELÉTRICO): 22 manobras"
echo "  • Modelo 4 (IFR & NAVEGAÇÃO): 22 manobras"
echo "  • Modelo 5 (AFCS & AUTOPILOT): 22 manobras"
echo "  • Modelo 6 (AFCS DEGRADAÇÕES): 22 manobras"
echo "  • Modelo 7 (AVIÔNICOS FAILURES): 22 manobras"
echo "  • Modelo 8 (ROTOR & TRANSMISSÃO): 22 manobras"
echo "  • Modelo 9 (FOGO & FUMAÇA): 22 manobras"
echo "  • Modelo 10 (OFFSHORE): 22 manobras"
echo ""
echo "🎯 Total: 220 manobras cadastradas nos 10 modelos"
