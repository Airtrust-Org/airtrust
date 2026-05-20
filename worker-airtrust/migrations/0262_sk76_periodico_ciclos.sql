-- ===========================================================================
-- 0262: SK76 – Treinamento Periódico 3 Ciclos (S-76C+)
-- Formato de código: S76-[XXX]-[NN]
-- 1. Soft-delete manobras com codigo LIKE '76%' (legado)
-- 2. Atualiza manobras restantes para AW139
-- 3. Insere 106 manobras únicas S76-* (SK76)
-- 4. Garante tipos_sessao VFR e IFR
-- 5. Cria 6 modelos de sessão periódicos SK76 (C1-C3, VFR/IFR)
-- 6. Cria vínculos manobras → modelos_sessao
-- Idempotente: INSERT OR IGNORE + ON CONFLICT + re-activação
-- ===========================================================================

-- ===========================================================================
-- PARTE 1: Soft-delete manobras legado com codigo LIKE '76%'
-- ===========================================================================

UPDATE manobras
SET deleted_at = datetime('now'), updated_at = datetime('now')
WHERE codigo LIKE '76%' AND deleted_at IS NULL;

-- Soft-delete dos vínculos cujas manobras foram deletadas
UPDATE modelos_sessao_manobras
SET deleted_at = datetime('now')
WHERE manobra_id IN (SELECT id FROM manobras WHERE codigo LIKE '76%')
  AND deleted_at IS NULL;

-- ===========================================================================
-- PARTE 2: Atribuir AW139 a todas as manobras restantes não SKxx
-- ===========================================================================

UPDATE manobras
SET tipo_aeronave = 'AW139', updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND (tipo_aeronave IS NULL OR tipo_aeronave NOT IN ('AW139', 'SK76'));

-- ===========================================================================
-- PARTE 3: Inserir 106 manobras únicas SK76 (S76-*)
-- INSERT OR IGNORE + re-ativação para idempotência
-- ===========================================================================

-- ── VFR Ciclo 1 ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-NVF-00', 'Procedimentos Normais VFR',                        'ACIONAMENTO', 'SK76',  1);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-HOT-00', 'Partida Quente (Hot Start)',                       'PARTIDA',     'SK76',  2);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-STF-00', 'Falha na Partida (Engine Start Failure)',           'PARTIDA',     'SK76',  3);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FMG-08', 'Fogo no Compartimento do Motor no Solo',            'SOLO',        'SK76',  4);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FMI-09', 'Fogo Interno no Motor após Desligamento',           'SOLO',        'SK76',  5);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-HOV-00', 'Controle Geral VFR – Hover & Táxi',                'HOVER',       'SK76',  6);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FMH-13', 'Falha de Motor no Hover',                           'HOVER',       'SK76',  7);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-TRH-38', 'Falha do Rotor de Cauda no Hover',                  'HOVER',       'SK76',  8);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-TDP-00', 'Decolagem Classe 2 – Helideck (TDP)',               'DECOLAGEM',   'SK76',  9);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FMA-14', 'Falha de Motor – Decolagem Abortada',               'DECOLAGEM',   'SK76', 10);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FMC-15', 'Falha de Motor – Decolagem Continuada',             'DECOLAGEM',   'SK76', 11);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-NRO-00', 'Disparo de NR (NR Overspeed)',                      'SUBIDA',      'SK76', 12);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-NRL-00', 'Queda de NR (NR Low)',                              'SUBIDA',      'SK76', 13);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CST-00', 'Estol de Compressor (Compressor Stall)',             'CRUZEIRO',    'SK76', 14);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MRV-00', 'Vibração do Rotor Principal',                       'CRUZEIRO',    'SK76', 15);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MGP-33', 'Pressão de Óleo da MGB 40–45 PSI',                 'CRUZEIRO',    'SK76', 16);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SSS-42', 'Luz do Sistema Servo Simples',                      'CRUZEIRO',    'SK76', 17);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FFL-32', 'Luz de Cautela do Filtro de Combustível',           'CRUZEIRO',    'SK76', 18);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FFM-32', 'Fluxo de Combustível fora do Normal',               'CRUZEIRO',    'SK76', 19);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-LGE-44', 'Trem de Pouso – Não Estende',                       'APROXIMACAO', 'SK76', 20);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-AUT-70', 'Autorotação',                                       'POUSO',       'SK76', 21);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-LDP-00', 'Pouso Classe 2 – Helideck (Committal Point)',       'POUSO',       'SK76', 22);

-- ── IFR Ciclo 1 ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-NIF-00', 'Procedimentos Normais IFR',                         'ACIONAMENTO', 'SK76', 23);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-BTO-51', 'Luz de Cautela Battery Off',                        'SOLO',        'SK76', 24);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-RMF-69', 'Falha do Radio Master',                             'SOLO',        'SK76', 25);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FDA-00', 'Uso do Diretor de Voo e Automação',                 'DECOLAGEM',   'SK76', 26);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CGI-00', 'Controle Geral IFR',                                'DECOLAGEM',   'SK76', 27);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SID-00', 'SID & STAR',                                        'SUBIDA',      'SK76', 28);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FCR-17', 'Falha de Motor em Cruzeiro',                        'CRUZEIRO',    'SK76', 29);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DM1-22', 'DECU – Falha Maior – Um Motor',                    'CRUZEIRO',    'SK76', 30);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DMN-21', 'DECU – Falha Menor',                               'CRUZEIRO',    'SK76', 31);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-N1T-30', 'Mau Func. do Indicador de N1 ou Torque',           'CRUZEIRO',    'SK76', 32);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-EOP-25', 'Pressão de Óleo do Motor – Luz de Aviso',          'CRUZEIRO',    'SK76', 33);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SDC-50', 'Luz de Cautela de Gerador CC Simples',              'CRUZEIRO',    'SK76', 34);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DCH-54', 'Luz de Aviso DC Generator Hot',                     'CRUZEIRO',    'SK76', 35);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-APF-57', 'Falha do Piloto Automático – Dual / Simples',      'CRUZEIRO',    'SK76', 36);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-TRM-58', 'Falha do Trim (Trim Fail Caution)',                 'CRUZEIRO',    'SK76', 37);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FDF-60', 'Falha do Diretor de Voo / FD Coupler',              'CRUZEIRO',    'SK76', 38);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-AHR-65', 'Falha do AHRS',                                    'CRUZEIRO',    'SK76', 39);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-HLD-00', 'Holding Pattern',                                   'DESCIDA',     'SK76', 40);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-EFV-11', 'Fogo de Origem Elétrica – VMC (Breakout)',          'APROXIMACAO', 'SK76', 41);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-UGE-46', 'Indicação Insegura – Extensão do Trem',             'APROXIMACAO', 'SK76', 42);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ILS-00', 'Aproximação ILS',                                   'POUSO',       'SK76', 43);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MIS-00', 'Arremetida (Missed Approach)',                      'POUSO',       'SK76', 44);

-- ── VFR Ciclo 2 (novos) ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-HNG-00', 'Partida Estagnada (Hung Start)',                    'PARTIDA',     'SK76', 45);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-OSP-27', 'Falha da Proteção contra Overspeed',                'SUBIDA',      'SK76', 46);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FMF-07', 'Fogo no Compartimento do Motor em Voo',             'CRUZEIRO',    'SK76', 47);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-XFD-20', 'Crossfeed Total após Falha de Motor',               'CRUZEIRO',    'SK76', 48);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FPL-31', 'Luz de Aviso de Pressão de Combustível',            'CRUZEIRO',    'SK76', 49);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-LOW-32', 'Luz de Cautela Fuel Low',                           'CRUZEIRO',    'SK76', 50);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MGL-33', 'Pressão de Óleo da MGB Baixa',                     'CRUZEIRO',    'SK76', 51);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MGC-36', 'Luz de Cautela de Chip da MGB',                    'CRUZEIRO',    'SK76', 52);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-TRD-39', 'Falha do Eixo do Rotor de Cauda em Voo',           'CRUZEIRO',    'SK76', 53);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SS2-43', 'Luzes de Cautela dos Sistemas Servo 1 e 2',        'CRUZEIRO',    'SK76', 54);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CLB-69', 'Emperramento do Comando de Passo Coletivo',         'CRUZEIRO',    'SK76', 55);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DOP-69', 'Luz de Cautela Door Open',                          'CRUZEIRO',    'SK76', 56);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-UGR-46', 'Indicação Insegura – Recolhimento do Trem',         'APROXIMACAO', 'SK76', 57);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-LGB-47', 'Trem de Pouso – Extensão de Emergência',            'APROXIMACAO', 'SK76', 58);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DIT-71', 'Ditching com Potência',                             'APROXIMACAO', 'SK76', 59);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-RBL-37', 'Luz de Cautela do Freio de Rotor',                  'POUSO',       'SK76', 60);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-NDL-00', 'Voo Noturno NDL (Circuito Padrão)',                 'NOTURNO',     'SK76', 61);

-- ── IFR Ciclo 2 (novos) ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ACG-48', 'Luz de Cautela do Gerador CA',                      'SOLO',        'SK76', 62);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-INV-49', 'Luz de Cautela do Inversor',                        'SOLO',        'SK76', 63);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ECO-20', 'Oscilação do Motor',                                'CRUZEIRO',    'SK76', 64);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DDE-21', 'DECU – Falha Degradada',                           'CRUZEIRO',    'SK76', 65);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ECH-26', 'Detector de Chip do Motor',                         'CRUZEIRO',    'SK76', 66);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-T5I-31', 'Mau Funcionamento do Indicador de T5',              'CRUZEIRO',    'SK76', 67);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DCD-50', 'Luzes de Cautela dos Geradores CC 1 e 2',          'CRUZEIRO',    'SK76', 68);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-BTO-53', 'Luz de Cautela Bus Tie Open',                       'CRUZEIRO',    'SK76', 69);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CDC-59', 'Cautela de Coletivo / Decouple',                    'CRUZEIRO',    'SK76', 70);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ADC-61', 'Falha do ADC – Computador de Dados de Voo',        'CRUZEIRO',    'SK76', 71);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CRT-63', 'Falha da Tela CRT / Falha Total do EFIS',           'CRUZEIRO',    'SK76', 72);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-EFI-12', 'Fogo de Origem Elétrica – IMC',                    'CRUZEIRO',    'SK76', 73);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-WSH-54', 'Luz de Cautela Windshield Hot',                     'APROXIMACAO', 'SK76', 74);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-PTH-55', 'Luz de Cautela Pitot Heat',                         'APROXIMACAO', 'SK76', 75);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-RNV-00', 'Aproximação RNAV (GPS)',                            'POUSO',       'SK76', 76);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SGA-15', 'Monomotor – Pouso Abortado / Arremetida',           'POUSO',       'SK76', 77);

-- ── VFR Ciclo 3 (novos) ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FGF-29', 'Falha no Fly Gate – Antes da Partida',              'SOLO',        'SK76', 78);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-WCP-73', 'Painel de Avisos e Cautelas (Análise)',             'SOLO',        'SK76', 79);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-BFL-28', 'Luz do Filtro de Barreira',                         'SUBIDA',      'SK76', 80);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-PAL-30', 'Luz Power Assurance',                               'SUBIDA',      'SK76', 81);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SFE-10', 'Eliminação de Fumaça e Vapores',                    'CRUZEIRO',    'SK76', 82);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-BCS-10', 'Fumaça no Compartimento de Bagagem',                'CRUZEIRO',    'SK76', 83);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ESF-18', 'Desligamento de Motor em Voo',                      'CRUZEIRO',    'SK76', 84);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-ERF-18', 'Religamento de Motor em Voo',                       'CRUZEIRO',    'SK76', 85);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-EOT-25', 'Temperatura de Óleo do Motor acima do Limite',      'CRUZEIRO',    'SK76', 86);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-OFL-30', 'Luz Out of Fly',                                    'CRUZEIRO',    'SK76', 87);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MOH-35', 'Temperatura de Óleo da MGB Alta',                   'CRUZEIRO',    'SK76', 88);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-IGB-37', 'Luz de Cautela de Chip / Temperatura da IGB/TGB',  'CRUZEIRO',    'SK76', 89);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-TCS-39', 'Falha do Sistema de Controle do Rotor de Cauda',    'CRUZEIRO',    'SK76', 90);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-TDM-41', 'Dano no Rotor de Cauda',                            'CRUZEIRO',    'SK76', 91);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-BHT-52', 'Luz de Aviso Battery Hot',                          'CRUZEIRO',    'SK76', 92);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-FCD-67', 'Emperramento do Amortecedor de Comando',             'APROXIMACAO', 'SK76', 93);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MED-00', 'Missão MEDVAC',                                     'ESPECIAL',    'SK76', 94);

-- ── IFR Ciclo 3 (novos) ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CCF-10', 'Fogo / Fumaça na Cabine em Voo',                   'CRUZEIRO',    'SK76', 95);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-DMB-24', 'DECU – Falha Maior – Ambos os Motores',            'CRUZEIRO',    'SK76', 96);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-AGB-48', 'Luz de Cautela de Rolamento do Gerador CA',         'CRUZEIRO',    'SK76', 97);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-EBV-54', 'Luz de Cautela Ess Bus Volts Low',                  'CRUZEIRO',    'SK76', 98);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-EAI-55', 'Luz de Cautela Engine Anti-Ice',                    'CRUZEIRO',    'SK76', 99);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-HOM-59', 'Mau Funcionamento de Hardover / Oscilatório',       'CRUZEIRO',    'SK76', 100);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-MBF-61', 'Falha do Freio Magnético – Cíclico / Coletivo',    'CRUZEIRO',    'SK76', 101);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-IID-62', 'Falha do Display IIDS',                             'CRUZEIRO',    'SK76', 102);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-SGA-62', 'Falha do Gerador de Símbolo / ADC',                'CRUZEIRO',    'SK76', 103);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-CFC-63', 'Falha do Ventilador CRT / Discrepância',            'CRUZEIRO',    'SK76', 104);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-UAR-00', 'Recuperação Atitudes Anormais',                     'CRUZEIRO',    'SK76', 105);
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, tipo_aeronave, ordem)
VALUES ('S76-VOR-00', 'Aproximação VOR/NDB',                               'POUSO',       'SK76', 106);

-- Re-ativar quaisquer S76-* que estejam soft-deleted
UPDATE manobras
SET deleted_at = NULL, updated_at = datetime('now')
WHERE codigo LIKE 'S76-%' AND deleted_at IS NOT NULL;

-- ===========================================================================
-- PARTE 4: Garantir tipos_sessao VFR e IFR
-- ===========================================================================

INSERT INTO tipos_sessao (codigo, nome, descricao, created_at, updated_at)
SELECT 'VFR', 'VFR', 'Visual Flight Rules', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM tipos_sessao WHERE codigo = 'VFR' AND deleted_at IS NULL);

INSERT INTO tipos_sessao (codigo, nome, descricao, created_at, updated_at)
SELECT 'IFR', 'IFR', 'Instrument Flight Rules', datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM tipos_sessao WHERE codigo = 'IFR' AND deleted_at IS NULL);

-- ===========================================================================
-- PARTE 5: Criar 6 modelos de sessão SK76 (3 ciclos × VFR/IFR)
-- ===========================================================================

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, created_at, updated_at)
VALUES (
  'SK76-C1-VFR',
  'CICLO 1 – SESSÃO VFR (S-76C+)',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo = 'VFR' AND deleted_at IS NULL ORDER BY id LIMIT 1),
  'SK76', 120, datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, created_at, updated_at)
VALUES (
  'SK76-C1-IFR',
  'CICLO 1 – SESSÃO IFR (S-76C+)',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo = 'IFR' AND deleted_at IS NULL ORDER BY id LIMIT 1),
  'SK76', 120, datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, created_at, updated_at)
VALUES (
  'SK76-C2-VFR',
  'CICLO 2 – SESSÃO VFR (S-76C+)',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo = 'VFR' AND deleted_at IS NULL ORDER BY id LIMIT 1),
  'SK76', 120, datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, created_at, updated_at)
VALUES (
  'SK76-C2-IFR',
  'CICLO 2 – SESSÃO IFR (S-76C+)',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo = 'IFR' AND deleted_at IS NULL ORDER BY id LIMIT 1),
  'SK76', 120, datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, created_at, updated_at)
VALUES (
  'SK76-C3-VFR',
  'CICLO 3 – SESSÃO VFR (S-76C+)',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo = 'VFR' AND deleted_at IS NULL ORDER BY id LIMIT 1),
  'SK76', 120, datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, created_at, updated_at)
VALUES (
  'SK76-C3-IFR',
  'CICLO 3 – SESSÃO IFR (S-76C+)',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo = 'IFR' AND deleted_at IS NULL ORDER BY id LIMIT 1),
  'SK76', 120, datetime('now'), datetime('now')
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

-- ===========================================================================
-- PARTE 6: Vínculos manobras → modelos_sessao (hard-delete + reinsere)
-- ===========================================================================

-- ── SK76-C1-VFR ─────────────────────────────────────────────────────────────
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-C1-VFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) VALUES
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-NVF-00' AND deleted_at IS NULL), 1,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-HOT-00' AND deleted_at IS NULL), 2,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-STF-00' AND deleted_at IS NULL), 3,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FMG-08' AND deleted_at IS NULL), 4,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FMI-09' AND deleted_at IS NULL), 5,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-HOV-00' AND deleted_at IS NULL), 6,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FMH-13' AND deleted_at IS NULL), 7,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TRH-38' AND deleted_at IS NULL), 8,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TDP-00' AND deleted_at IS NULL), 9,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FMA-14' AND deleted_at IS NULL),10,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FMC-15' AND deleted_at IS NULL),11,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-NRO-00' AND deleted_at IS NULL),12,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-NRL-00' AND deleted_at IS NULL),13,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-CST-00' AND deleted_at IS NULL),14,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-MRV-00' AND deleted_at IS NULL),15,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-MGP-33' AND deleted_at IS NULL),16,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-SSS-42' AND deleted_at IS NULL),17,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FFL-32' AND deleted_at IS NULL),18,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FFM-32' AND deleted_at IS NULL),19,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-LGE-44' AND deleted_at IS NULL),20,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-AUT-70' AND deleted_at IS NULL),21,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-VFR'),(SELECT id FROM manobras WHERE codigo='S76-LDP-00' AND deleted_at IS NULL),22,1);

-- ── SK76-C1-IFR ─────────────────────────────────────────────────────────────
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-C1-IFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) VALUES
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-NIF-00' AND deleted_at IS NULL), 1,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-BTO-51' AND deleted_at IS NULL), 2,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-RMF-69' AND deleted_at IS NULL), 3,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FDA-00' AND deleted_at IS NULL), 4,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CGI-00' AND deleted_at IS NULL), 5,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-SID-00' AND deleted_at IS NULL), 6,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FCR-17' AND deleted_at IS NULL), 7,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-DM1-22' AND deleted_at IS NULL), 8,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-DMN-21' AND deleted_at IS NULL), 9,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-N1T-30' AND deleted_at IS NULL),10,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-EOP-25' AND deleted_at IS NULL),11,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-SDC-50' AND deleted_at IS NULL),12,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-DCH-54' AND deleted_at IS NULL),13,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-APF-57' AND deleted_at IS NULL),14,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-TRM-58' AND deleted_at IS NULL),15,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FDF-60' AND deleted_at IS NULL),16,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-AHR-65' AND deleted_at IS NULL),17,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-HLD-00' AND deleted_at IS NULL),18,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-EFV-11' AND deleted_at IS NULL),19,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-UGE-46' AND deleted_at IS NULL),20,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-ILS-00' AND deleted_at IS NULL),21,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C1-IFR'),(SELECT id FROM manobras WHERE codigo='S76-MIS-00' AND deleted_at IS NULL),22,1);

-- ── SK76-C2-VFR ─────────────────────────────────────────────────────────────
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-C2-VFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) VALUES
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-NVF-00' AND deleted_at IS NULL), 1,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-HNG-00' AND deleted_at IS NULL), 2,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-HOV-00' AND deleted_at IS NULL), 3,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TDP-00' AND deleted_at IS NULL), 4,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-OSP-27' AND deleted_at IS NULL), 5,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FMF-07' AND deleted_at IS NULL), 6,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-XFD-20' AND deleted_at IS NULL), 7,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FPL-31' AND deleted_at IS NULL), 8,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-LOW-32' AND deleted_at IS NULL), 9,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-MGL-33' AND deleted_at IS NULL),10,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-MGC-36' AND deleted_at IS NULL),11,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TRD-39' AND deleted_at IS NULL),12,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-SS2-43' AND deleted_at IS NULL),13,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-CLB-69' AND deleted_at IS NULL),14,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-DOP-69' AND deleted_at IS NULL),15,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-UGR-46' AND deleted_at IS NULL),16,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-LGB-47' AND deleted_at IS NULL),17,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-DIT-71' AND deleted_at IS NULL),18,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-AUT-70' AND deleted_at IS NULL),19,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-LDP-00' AND deleted_at IS NULL),20,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-RBL-37' AND deleted_at IS NULL),21,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-VFR'),(SELECT id FROM manobras WHERE codigo='S76-NDL-00' AND deleted_at IS NULL),22,1);

-- ── SK76-C2-IFR ─────────────────────────────────────────────────────────────
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-C2-IFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) VALUES
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-NIF-00' AND deleted_at IS NULL), 1,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-ACG-48' AND deleted_at IS NULL), 2,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-INV-49' AND deleted_at IS NULL), 3,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FDA-00' AND deleted_at IS NULL), 4,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CGI-00' AND deleted_at IS NULL), 5,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-SID-00' AND deleted_at IS NULL), 6,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FCR-17' AND deleted_at IS NULL), 7,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-ECO-20' AND deleted_at IS NULL), 8,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-DDE-21' AND deleted_at IS NULL), 9,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-ECH-26' AND deleted_at IS NULL),10,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-T5I-31' AND deleted_at IS NULL),11,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-DCD-50' AND deleted_at IS NULL),12,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-BTO-53' AND deleted_at IS NULL),13,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CDC-59' AND deleted_at IS NULL),14,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-ADC-61' AND deleted_at IS NULL),15,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CRT-63' AND deleted_at IS NULL),16,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-EFI-12' AND deleted_at IS NULL),17,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-HLD-00' AND deleted_at IS NULL),18,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-WSH-54' AND deleted_at IS NULL),19,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-PTH-55' AND deleted_at IS NULL),20,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-RNV-00' AND deleted_at IS NULL),21,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C2-IFR'),(SELECT id FROM manobras WHERE codigo='S76-SGA-15' AND deleted_at IS NULL),22,1);

-- ── SK76-C3-VFR ─────────────────────────────────────────────────────────────
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-C3-VFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) VALUES
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-NVF-00' AND deleted_at IS NULL), 1,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FGF-29' AND deleted_at IS NULL), 2,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-WCP-73' AND deleted_at IS NULL), 3,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-HOV-00' AND deleted_at IS NULL), 4,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TDP-00' AND deleted_at IS NULL), 5,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-BFL-28' AND deleted_at IS NULL), 6,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-PAL-30' AND deleted_at IS NULL), 7,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-SFE-10' AND deleted_at IS NULL), 8,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-BCS-10' AND deleted_at IS NULL), 9,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-ESF-18' AND deleted_at IS NULL),10,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-ERF-18' AND deleted_at IS NULL),11,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-EOT-25' AND deleted_at IS NULL),12,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-OFL-30' AND deleted_at IS NULL),13,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-MOH-35' AND deleted_at IS NULL),14,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-IGB-37' AND deleted_at IS NULL),15,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TCS-39' AND deleted_at IS NULL),16,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-TDM-41' AND deleted_at IS NULL),17,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-BHT-52' AND deleted_at IS NULL),18,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-FCD-67' AND deleted_at IS NULL),19,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-AUT-70' AND deleted_at IS NULL),20,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-LDP-00' AND deleted_at IS NULL),21,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-VFR'),(SELECT id FROM manobras WHERE codigo='S76-MED-00' AND deleted_at IS NULL),22,1);

-- ── SK76-C3-IFR ─────────────────────────────────────────────────────────────
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-C3-IFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria) VALUES
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-NIF-00' AND deleted_at IS NULL), 1,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FDA-00' AND deleted_at IS NULL), 2,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CGI-00' AND deleted_at IS NULL), 3,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-SID-00' AND deleted_at IS NULL), 4,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-FCR-17' AND deleted_at IS NULL), 5,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CCF-10' AND deleted_at IS NULL), 6,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-DMB-24' AND deleted_at IS NULL), 7,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-AGB-48' AND deleted_at IS NULL), 8,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-EBV-54' AND deleted_at IS NULL), 9,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-EAI-55' AND deleted_at IS NULL),10,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-HOM-59' AND deleted_at IS NULL),11,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-MBF-61' AND deleted_at IS NULL),12,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-IID-62' AND deleted_at IS NULL),13,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-SGA-62' AND deleted_at IS NULL),14,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-CFC-63' AND deleted_at IS NULL),15,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-UAR-00' AND deleted_at IS NULL),16,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-HLD-00' AND deleted_at IS NULL),17,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-RBL-37' AND deleted_at IS NULL),18,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-ILS-00' AND deleted_at IS NULL),19,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-MIS-00' AND deleted_at IS NULL),20,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-VOR-00' AND deleted_at IS NULL),21,1),
((SELECT id FROM modelos_sessao WHERE codigo='SK76-C3-IFR'),(SELECT id FROM manobras WHERE codigo='S76-RNV-00' AND deleted_at IS NULL),22,1);
