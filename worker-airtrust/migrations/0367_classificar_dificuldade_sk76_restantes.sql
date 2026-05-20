-- Migration 0367: Classificar nivel_dificuldade para manobras SK76 restantes
-- Cobre as 80 manobras S76-* (TREINAMENTO) e 22 S76-LOFT-* (PER)
-- Idempotente: so atualiza se nivel_dificuldade IS NULL ou = '-'
-- EXA, INV, LOFT-CHK/NOT/OFF sao intencionalmente excluidos (procedurais/LOFT por design)

-- ============================================================
-- AVANCADO: Emergencias criticas, fogo de motor, falhas multiplas,
--           falhas de controle de voo, falha de rotor de cauda
-- ============================================================

-- Emergencias de motor / fogo
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-EFI-12' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-EFV-11' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-ERF-18' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-ESF-18' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Falha de motor com DECU
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-DDE-21' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-DM1-22' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-DMB-24' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Falha de motor em baixa altitude / decolagem
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-BFL-28' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-CCF-10' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Falhas de controle de voo (criticas)
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-BCS-10' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-CFC-63' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-FCD-67' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Falha do rotor de cauda (emergencia critica)
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-TCS-39' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-TDM-41' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-TRD-39' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Crossfeed total apos falha de motor (procedimento de emergencia complexo)
UPDATE manobras SET nivel_dificuldade = 'AVANCADO', updated_at = datetime('now') WHERE codigo = 'S76-XFD-20' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- ============================================================
-- INTERMEDIARIO: Falhas de sistemas, luzes de cautela,
--                mau funcionamento de instrumentos, procedimentos especiais
-- ============================================================

-- Luzes de cautela de sistema eletrico
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-ACG-48' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-AGB-48' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-DCD-50' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-SDC-50' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Luzes de cautela de temperatura/aquecimento
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-BHT-52' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-BTO-53' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-AHR-65' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-DCH-54' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-WSH-54' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-EBV-54' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-EAI-55' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Falhas de computadores/sensores/indicadores
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-ADC-61' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-CDC-59' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-CRT-63' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-IID-62' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-MBF-61' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-SGA-62' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-FDF-60' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Mau funcionamento de indicadores de motor
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-T5I-31' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-DIT-71' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-FPL-31' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-HOM-59' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Falhas de sistemas de voo
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-APF-57' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-SS2-43' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-TRM-58' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-CLB-69' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Trem de pouso (cautelas/indicacoes inseguras)
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-UGE-46' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-UGR-46' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LGB-47' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Freio de rotor / indicadores
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-RBL-37' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-IGB-37' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Combustivel (cautelas/monitoramento)
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-FCR-17' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-FGF-29' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-MGC-36' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-MGL-33' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-MOH-35' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Motor (cautelas/monitoramento/falhas parciais)
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-ECO-20' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-ECH-26' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-EOP-25' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-EOT-25' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-DMN-21' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-DOP-69' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-FMF-07' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Painel de avisos e sistemas de alerta
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-WCP-73' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-N1T-30' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-OFL-30' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-PAL-30' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-OSP-27' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOW-32' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Procedimentos especiais
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-PTH-55' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-SFE-10' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-SGA-15' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- ============================================================
-- BASICO: Manobras normais, procedimentos padrao, navegacao basica
-- ============================================================

-- Procedimentos normais de voo IFR/NAV
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-CGI-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-FDA-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-HLD-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-HNG-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-ILS-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-MIS-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-RNV-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-SID-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-VOR-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-UAR-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- Procedimentos operacionais basicos
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-INV-49' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'BASICO', updated_at = datetime('now') WHERE codigo = 'S76-MED-00' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- ============================================================
-- SK76 PER (S76-LOFT): LOFT periodico - INTERMEDIARIO
-- Cenarios integrados que testam multiplas competencias em ambiente realista
-- ============================================================

UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-01' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-02' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-03' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-04' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-05' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-06' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-07' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-08' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-09' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-10' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-11' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-12' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-13' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-14' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-15' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-16' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-17' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-18' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-19' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-20' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-21' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');
UPDATE manobras SET nivel_dificuldade = 'INTERMEDIARIO', updated_at = datetime('now') WHERE codigo = 'S76-LOFT-22' AND (nivel_dificuldade IS NULL OR nivel_dificuldade = '-');

-- ============================================================
-- VALIDACAO: Execute apos aplicar para verificar
-- ============================================================
-- SELECT codigo, nome, nivel_dificuldade FROM manobras WHERE tipo_aeronave = 'SK76' AND deleted_at IS NULL ORDER BY nivel_dificuldade, codigo;
-- SELECT nivel_dificuldade, COUNT(*) FROM manobras WHERE tipo_aeronave = 'SK76' AND deleted_at IS NULL GROUP BY nivel_dificuldade;
-- SELECT codigo, nome FROM manobras WHERE (nivel_dificuldade IS NULL OR nivel_dificuldade = '-') AND deleted_at IS NULL AND codigo NOT LIKE 'EXA-%' AND codigo NOT LIKE 'INV-%' AND codigo NOT LIKE 'LOFT-CHK-%' AND codigo NOT LIKE 'LOFT-NOT-%' AND codigo NOT LIKE 'LOFT-OFF-%' ORDER BY codigo;
