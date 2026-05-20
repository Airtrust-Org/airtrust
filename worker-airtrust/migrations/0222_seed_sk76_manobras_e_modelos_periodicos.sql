-- =============================================================================
-- 0222: SK76 - Manobras + Modelos de Sessão Periódicos
-- Inserir 54 manobras SK76 + 2 modelos periódicos (VFR + IFR) com seus vínculos
-- Idempotente: INSERT OR IGNORE para manobras, ON CONFLICT DO UPDATE para modelos
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: MANOBRAS SK76 (54 manobras)
-- ─────────────────────────────────────────────────────────────────────────────

-- Voo Básico
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-AUTAG', 'Autorrotação para a água', 'VOO_BASICO', 'Autorrotação para a água', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-POUAB', 'Pouso abortado', 'VOO_BASICO', 'Pouso abortado', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-POUMO', 'Pouso monomotor – Categoria A ou B', 'VOO_BASICO', 'Single-Engine Landing – Category "A" or "B"', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-APXAL', 'Aproximação alternada – Categoria A', 'VOO_BASICO', 'Single-Engine Failure During Approach – Alternate Category "A" Profile', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-ARRIF', 'Arremetida IFR', 'VOO_BASICO', 'Arremetida IFR', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-APXPI', 'Aproximação perdida IFR', 'VOO_BASICO', 'Aproximação perdida IFR', 'SK76', 'TREINAMENTO');

-- Procedimentos Normais
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DECSI', 'Decolagem por instrumentos (SID)', 'PROCEDIMENTOS', 'Decolagem por instrumentos (SID)', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-PRGGP', 'Programação do GPS, HSI e EFIS', 'PROCEDIMENTOS', 'Programação do GPS, HSI e EFIS', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-APXPR', 'Aproximação de precisão IFR (ILS/RNP)', 'PROCEDIMENTOS', 'Aproximação de precisão IFR (ILS/RNP)', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-APXNP', 'Aproximação de não precisão IFR (VOR/NDB)', 'PROCEDIMENTOS', 'Aproximação de não precisão IFR (VOR/NDB)', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-APXOI', 'Aproximação IFR com um motor inoperante (OEI)', 'PROCEDIMENTOS', 'Aproximação IFR com um motor inoperante (OEI)', 'SK76', 'TREINAMENTO');

-- AFCS
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALPA', 'Falha no piloto automático', 'AFCS', 'Autopilot Malfunction', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALFD', 'Falha no flight director', 'AFCS', 'Flight Director Malfunction', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALTS', 'Falha no indicador TS', 'AFCS', 'TS Indicator Malfunction', 'SK76', 'TREINAMENTO');

-- Aviônicos
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALEF', 'Mau funcionamento do EFIS', 'AVIONICOS', 'Electronic Flight Instrument System Malfunctions', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALAD', 'Falha no sistema de dados de voo', 'AVIONICOS', 'Air Data Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-PERAT', 'Perda do indicador primário de atitude em IMC', 'AVIONICOS', 'Loss of Primary Attitude Indicator in IMC', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-PER26', 'Perda de referência de 26 VAC', 'AVIONICOS', 'Loss of 26 VAC References', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALRM', 'Falha no sistema mestre de rádio', 'AVIONICOS', 'Radio Master System', 'SK76', 'TREINAMENTO');

-- Sistema Elétrico
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALGC', 'Falha em um gerador DC', 'ELETRICO', 'Single DC Generator Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALGD', 'Falha em ambos os geradores DC', 'ELETRICO', 'Dual DC Generator Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-SOBGD', 'Sobretemperatura de gerador DC', 'ELETRICO', 'DC Generator Overtemperature', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALGA', 'Falha no gerador AC', 'ELETRICO', 'AC Generator Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALEB', 'Falha de alimentação no barramento essencial DC', 'ELETRICO', 'DC Essential Bus Feed Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALIV', 'Falha no inversor', 'ELETRICO', 'Inverter Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FALFF', 'Falha de alimentação – feeder / bateria no nariz', 'ELETRICO', 'Feeder Fault', 'SK76', 'TREINAMENTO');

-- Powerplant
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DCUMN', 'Falha menor do DECU', 'POWERPLANT', 'DECU Minor Fault', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DCUDG', 'Falha degradada do DECU', 'POWERPLANT', 'DECU Degraded Fault', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DCU1M', 'Falha total do DECU em um motor', 'POWERPLANT', 'DECU Total Fault on One Engine', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DCU2M', 'Falha total do DECU em ambos os motores', 'POWERPLANT', 'DECU Total Faults on Both Engines', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MOTCA', 'Falha de motor na decolagem – Categoria A', 'POWERPLANT', 'Single-Engine Failure on Takeoff – Category "A"', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MOTCB', 'Falha de motor na decolagem – Categoria B', 'POWERPLANT', 'Single-Engine Failure on Takeoff – Category "B"', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MOTHV', 'Falha de motor em pairado 5 a 10 pés', 'POWERPLANT', 'Single-Engine Failure – Hover 5 to 10 feet', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MOTCZ', 'Falha de motor durante o cruzeiro', 'POWERPLANT', 'Single-Engine Failure During Cruise', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MOTAP', 'Falha de motor na aproximação – Categoria A', 'POWERPLANT', 'Single-Engine Failure During Approach – Category "A"', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DUAHV', 'Falha dupla de motor em pairado ou decolagem até 10 pés', 'POWERPLANT', 'Dual-Engine Failure While Hovering or on Takeoff at 10 feet', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DUADC', 'Falha dupla de motor durante decolagem e subida inicial', 'POWERPLANT', 'Dual-Engine Failure During Takeoff and Initial Climb', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-DUACZ', 'Falha dupla de motor durante o cruzeiro', 'POWERPLANT', 'Dual-Engine Failure During Cruise', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-OILMT', 'Falha no sistema de óleo do motor', 'POWERPLANT', 'Engine Oil System Failure', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-COMBX', 'Luz de baixa pressão de combustível acesa', 'POWERPLANT', 'Fuel Pressure Warning Light On', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FLWNR', 'Vazão de combustível fora da faixa normal', 'POWERPLANT', 'Fuel Flowmeter Beyond Normal Range', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-N1TQF', 'Falha nos indicadores N1 ou Torque', 'POWERPLANT', 'N1 Indicator or Torque Indicator Malfunction', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-INCMO', 'Incêndio no compartimento do motor', 'POWERPLANT', 'Engine Compartment Fire', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-INCCB', 'Incêndio na cabine ou cockpit', 'POWERPLANT', 'Cabin or Cockpit Fire', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-FUMBG', 'Fumaça no compartimento de bagagem', 'POWERPLANT', 'Baggage Compartment Smoke Detected', 'SK76', 'TREINAMENTO');

-- Sistemas Mecânicos
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MGBSF', 'Falhas no sistema da MGB', 'SISTEMAS_MECANICOS', 'Main Gear Box System Failures', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-MGBOL', 'Falhas no sistema de óleo da MGB', 'SISTEMAS_MECANICOS', 'Main Gear Box Oil System Failures', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-CHPTG', 'Chip ou alta temperatura no gearbox intermediário ou traseiro', 'SISTEMAS_MECANICOS', 'Intermediate or Tail Gear Box Chip/High Oil', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-SERTQ', 'Perda de pressão no servo do rotor de cauda', 'SISTEMAS_MECANICOS', 'Loss of Hydraulic Pressure to the Tail Rotor Servo', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-SERJM', 'Atuador travado ou válvula de corte defeituosa', 'SISTEMAS_MECANICOS', 'Servo Unit Jam or Malfunctioning Servo Shutoff Valve', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-AMOTV', 'Amortecedor dos comandos travado', 'SISTEMAS_MECANICOS', 'Flight Control Damper Jam', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-TRSRC', 'Falha do sistema de transmissão do rotor de cauda em voo à frente', 'SISTEMAS_MECANICOS', 'Tail Rotor Drive System Failure in Forward Flight', 'SK76', 'TREINAMENTO');

INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-CTRRC', 'Falha no sistema de controle do rotor de cauda', 'SISTEMAS_MECANICOS', 'Tail Rotor Control System Failure', 'SK76', 'TREINAMENTO');

-- Sistemas Gerais
INSERT OR IGNORE INTO manobras (codigo, nome, categoria, descricao, tipo_aeronave, tipo_sessao)
VALUES ('76-HIDPB', 'Falha da bomba ou perda de pressão no sistema hidráulico principal', 'SISTEMAS', 'Pump Failure or Loss of Pressure in Basic Hydraulic', 'SK76', 'TREINAMENTO');


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: MODELOS DE SESSÃO PERIÓDICOS SK76
-- tipo_sessao_id = 9 (PER / Treinamento Periódico)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, empresa_id, ativo)
VALUES (
  'SK76-P-01/03',
  '01/03 - PERIÓDICO: SK76 - VFR',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo IN ('PER','PERIODICO') OR nome LIKE '%Periód%' LIMIT 1),
  'SK76',
  120,
  1,
  1
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;

INSERT INTO modelos_sessao (codigo, nome, tipo, tipo_sessao_id, modelo_aeronave, duracao_estimada, empresa_id, ativo)
VALUES (
  'SK76-P-02/03',
  '02/03 - PERIÓDICO: SK76 - IFR',
  'PERIODICO',
  (SELECT id FROM tipos_sessao WHERE codigo IN ('PER','PERIODICO') OR nome LIKE '%Periód%' LIMIT 1),
  'SK76',
  120,
  1,
  1
)
ON CONFLICT(codigo) DO UPDATE SET
  nome            = excluded.nome,
  tipo            = excluded.tipo,
  tipo_sessao_id  = excluded.tipo_sessao_id,
  modelo_aeronave = excluded.modelo_aeronave,
  duracao_estimada= excluded.duracao_estimada,
  updated_at      = datetime('now'),
  deleted_at      = NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3: VÍNCULOS MANOBRAS → MODELO 01/03 VFR (35 manobras únicas)
-- Hard-delete antigos + reinsere (idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-P-01/03');

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, ROW_NUMBER() OVER (PARTITION BY ms.id ORDER BY m.id), 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'SK76-P-01/03'
  AND ms.deleted_at IS NULL
  AND m.deleted_at IS NULL
  AND m.codigo IN (
    '76-AUTAG','76-POUAB','76-POUMO','76-APXAL',
    '76-FALGC','76-FALGD','76-SOBGD','76-FALEB','76-FALIV',
    '76-DCUMN','76-DCUDG','76-DCU1M',
    '76-MOTCA','76-MOTCB','76-MOTHV','76-MOTCZ','76-MOTAP',
    '76-DUAHV','76-DUADC','76-DUACZ',
    '76-OILMT','76-COMBX','76-FLWNR',
    '76-INCMO','76-INCCB','76-FUMBG',
    '76-MGBSF','76-MGBOL','76-CHPTG',
    '76-SERTQ','76-SERJM','76-AMOTV','76-TRSRC','76-CTRRC',
    '76-HIDPB'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 4: VÍNCULOS MANOBRAS → MODELO 02/03 IFR (26 manobras únicas)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM modelos_sessao_manobras
WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'SK76-P-02/03');

INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem, obrigatoria)
SELECT ms.id, m.id, ROW_NUMBER() OVER (PARTITION BY ms.id ORDER BY m.id), 1
FROM modelos_sessao ms, manobras m
WHERE ms.codigo = 'SK76-P-02/03'
  AND ms.deleted_at IS NULL
  AND m.deleted_at IS NULL
  AND m.codigo IN (
    '76-DECSI','76-PRGGP','76-APXPR','76-APXNP','76-APXOI',
    '76-ARRIF','76-APXPI',
    '76-FALPA','76-FALFD','76-FALTS',
    '76-FALEF','76-FALAD','76-PERAT','76-PER26','76-FALRM',
    '76-FALGA','76-FALEB','76-FALFF',
    '76-DCU2M',
    '76-MOTCZ','76-MOTAP','76-POUMO','76-DUACZ',
    '76-COMBX','76-N1TQF','76-HIDPB'
  );
