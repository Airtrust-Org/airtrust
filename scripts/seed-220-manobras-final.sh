#!/bin/bash
set -e

DB_NAME="airtrust-db"

echo "🚀 Populando 220 manobras nos 10 modelos de sessão..."

SQL_FILE=$(mktemp)

cat > "$SQL_FILE" << 'EOF'
-- Desabilitar foreign keys temporariamente
PRAGMA foreign_keys = OFF;

-- Limpar relacionamentos existentes
DELETE FROM modelos_sessao_manobras WHERE modelo_id BETWEEN 16 AND 25;

-- ============================================================
-- SESSÃO 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO (modelo_id: 16)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(16, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 1, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 2, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 3, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 4, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3'), 5, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 6, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 7, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 8, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-CST-59'), 9, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-OVS-64'), 10, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-NGO-63'), 11, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-CND-61'), 12, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-TNF-62'), 13, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 14, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-2FP-74'), 15, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-EFP-75'), 16, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-OIL-18'), 17, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 18, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-EEC-18'), 19, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-IDL-16'), 20, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='WAR-GER-27'), 21, 1, datetime('now')),
(16, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 2: EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES (modelo_id: 17)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(17, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 1, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 2, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-EEC-18'), 3, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-IDL-16'), 4, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-CST-59'), 5, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-OVS-64'), 6, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-NGO-63'), 7, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-OIL-18'), 8, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 9, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 10, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 11, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 12, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-CND-61'), 13, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-TNF-62'), 14, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 15, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-2FP-74'), 16, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='CAU-EFP-75'), 17, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 18, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 19, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 20, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3'), 21, 1, datetime('now')),
(17, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 3: SISTEMA ELÉTRICO & NOTURNO (modelo_id: 18)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(18, (SELECT id FROM manobras WHERE codigo='WAR-GEN-11'), 1, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-BAT-14'), 2, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-AUX-14'), 3, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-DCG-53'), 4, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-BOF-55'), 5, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-DCB-56'), 6, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-ACB-57'), 7, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-28D-58'), 8, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 9, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 10, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 11, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3'), 12, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 13, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 14, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 15, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 16, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 17, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 18, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 19, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='WAR-GER-27'), 20, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='CAU-HYP-77'), 21, 1, datetime('now')),
(18, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 4: INTRODUÇÃO IFR & NAVEGAÇÃO BÁSICA (modelo_id: 19)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 1, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 2, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2'), 3, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3'), 4, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1'), 5, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X3'), 6, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4'), 7, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 8, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 9, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 10, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 11, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 12, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 13, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 14, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 15, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 16, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1'), 17, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-ADC-48'), 18, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-GPS-52'), 19, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='CAU-FMS-51'), 20, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 21, 1, datetime('now')),
(19, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X3'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 5: AFCS INTRODUÇÃO & AUTOPILOT (modelo_id: 20)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2'), 1, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 2, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 3, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3'), 4, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-APO-38'), 5, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1'), 6, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X3'), 7, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X4'), 8, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2'), 9, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4'), 10, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 11, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 12, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 13, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 14, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 15, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 16, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 17, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 18, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 19, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1'), 20, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-GPS-52'), 21, 1, datetime('now')),
(20, (SELECT id FROM manobras WHERE codigo='CAU-FMS-51'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 6: AFCS DEGRADAÇÕES & MANUAL REVERSION (modelo_id: 21)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(21, (SELECT id FROM manobras WHERE codigo='CAU-APF-37'), 1, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-MIS-40'), 2, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-SAS-41'), 3, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-AFD-41'), 4, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 5, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 6, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3'), 7, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2'), 8, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4'), 9, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 10, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 11, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1'), 12, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X3'), 13, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 14, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 15, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 16, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 17, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 18, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 19, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 20, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2'), 21, 1, datetime('now')),
(21, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 7: AVIÔNICOS FAILURES & PARTIAL PANEL (modelo_id: 22)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(22, (SELECT id FROM manobras WHERE codigo='CAU-ADS-46'), 1, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-AHR-47'), 2, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-DUD-46'), 3, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-PFD-45'), 4, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-MFD-45'), 5, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-EIC-45'), 6, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-ADC-48'), 7, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4'), 8, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 9, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 10, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-APP-X2'), 11, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3'), 12, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1'), 13, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2'), 14, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 15, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 16, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 17, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 18, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 19, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 20, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 21, 1, datetime('now')),
(22, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 8: ROTOR, TRANSMISSÃO & HIDRÁULICO (modelo_id: 23)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(23, (SELECT id FROM manobras WHERE codigo='WAR-MGB-30'), 1, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TMP-30'), 2, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-MGP-105'), 3, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TDR-X1'), 4, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TCS-X1'), 5, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-MRC-X1'), 6, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-TRC-X1'), 7, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-HYP-77'), 8, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-SRV-80'), 9, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 10, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 11, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 12, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 13, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 14, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-GER-27'), 15, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 16, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 17, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 18, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 19, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 20, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 21, 1, datetime('now')),
(23, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 9: FOGO, FUMAÇA & HIGHSTRESS (modelo_id: 24)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(24, (SELECT id FROM manobras WHERE codigo='WAR-FIR-21'), 1, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-CAB-23'), 2, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-BAG-23'), 3, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-O2P-82'), 4, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 5, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 6, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 7, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 8, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 9, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 10, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-GER-27'), 11, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-HYP-77'), 12, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-SRV-80'), 13, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 14, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 15, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 16, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 17, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 18, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3'), 19, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='WAR-STA-X1'), 20, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X4'), 21, 1, datetime('now')),
(24, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 22, 1, datetime('now'));

-- ============================================================
-- SESSÃO 10: OFFSHORE & PERFORMANCE OPERATIONS (modelo_id: 25)
-- ============================================================
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria, created_at) VALUES
(25, (SELECT id FROM manobras WHERE codigo='OPS-OFF-X1'), 1, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-OFF-X2'), 2, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-APP-X4'), 3, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X2'), 4, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X1'), 5, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X2'), 6, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-X3'), 7, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X1'), 8, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NAV-X2'), 9, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-APP-X1'), 10, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-FLO-73'), 11, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-OUT-15'), 12, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='FLY-BAS-17'), 13, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-2FP-74'), 14, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-LOW-29'), 15, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-HIG-29'), 16, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-HOT-65'), 17, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-LIC-60'), 18, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='WAR-GEN-11'), 19, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='CAU-DCG-53'), 20, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-NRM-X1'), 21, 1, datetime('now')),
(25, (SELECT id FROM manobras WHERE codigo='OPS-APP-X3'), 22, 1, datetime('now'));

-- Reabilitar foreign keys
PRAGMA foreign_keys = ON;

-- Verificar resultado
SELECT 
  ms.id, 
  ms.codigo, 
  ms.nome,
  COUNT(msm.id) as total_manobras
FROM modelos_sessao ms
LEFT JOIN modelos_sessao_manobras msm ON msm.modelo_id = ms.id
WHERE ms.id BETWEEN 16 AND 25
GROUP BY ms.id
ORDER BY ms.id;
EOF

echo "📤 Aplicando ao banco remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$SQL_FILE"

rm "$SQL_FILE"

echo "✅ 220 manobras populadas com sucesso!"
