-- Migration 0180: Implementar Treinamento Periódico AW139 (3 Ciclos)
-- Baseado em: TREINAMENTO-PERIODICO-REORDENADO.md

-- 0. Garantir tabelas de suporte (auto-healing para ambiente local)
CREATE TABLE IF NOT EXISTS modelos_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT, -- RECORRENTE, INICIAL, etc
  descricao TEXT,
  ordem_no_treinamento INTEGER DEFAULT 0,
  codigo_aeronave TEXT, -- AW139
  duracao_estimada INTEGER DEFAULT 120,
  tipo_sessao_id INTEGER, -- FK opcional se usar tipos_sessao
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS modelos_sessao_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  obrigatoria BOOLEAN DEFAULT 1,
  observacoes TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id)
);

-- Index para performance
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_codigo ON modelos_sessao(codigo);
CREATE INDEX IF NOT EXISTS idx_modelos_manobras_modelo ON modelos_sessao_manobras(modelo_id);
-- Baseado em: TREINAMENTO-PERIODICO-REORDENADO.md

-- 1. Garantir que a tabela manobras (CATALOGO) exista
CREATE TABLE IF NOT EXISTS manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT,
  descricao TEXT,
  categoria TEXT,
  tipo_aeronave TEXT, -- Ex: AW139
  tipo_sessao TEXT,   -- Ex: VFR, IFR
  ordem INTEGER DEFAULT 0,
  obrigatoria BOOLEAN DEFAULT 1,
  ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);

-- Index para manobras
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria);

-- 2. Inserir/Atualizar Manobras (Upsert)
INSERT OR REPLACE INTO manobras (codigo, nome, descricao, categoria, tipo_aeronave) VALUES
-- Categoria: Powerplant (Sistema Motores)
('CAU-HOT-65', 'Hot Start', 'Partida quente no motor', 'POWERPLANT', 'AW139'),
('WAR-OUT-15', 'Engine Failure', 'Falha de motor em voo', 'POWERPLANT', 'AW139'),
('WAR-LOW-29', 'Rotor RPM Low', 'Baixa rotação do rotor', 'POWERPLANT', 'AW139'),
('WAR-HIG-29', 'Rotor RPM High', 'Alta rotação do rotor', 'POWERPLANT', 'AW139'),
('WAR-IDL-16', 'Engine Stuck at IDLE', 'Motor travado em IDLE', 'POWERPLANT', 'AW139'),
('CAU-CST-59', 'Compressor Stall', 'Estol de compressor', 'POWERPLANT', 'AW139'),
('CAU-OVS-64', 'Engine Overspeed', 'Sobrevelocidade do motor', 'POWERPLANT', 'AW139'),
('WAR-FIR-21', 'Engine Fire', 'Fogo no motor', 'POWERPLANT', 'AW139'),
('WAR-SHT-19', 'Emergency Engine Shutdown', 'Corte do motor em emergência', 'POWERPLANT', 'AW139'),
('WAR-EEC-18', 'EEC Failure', 'Falha no controle eletrônico do motor', 'POWERPLANT', 'AW139'),
('CAU-2FP-74', 'Double Fuel Pump Failure', 'Falha dupla de bomba de combustível', 'POWERPLANT', 'AW139'),
('CAU-FLO-73', 'Fuel Low', 'Nível baixo de combustível', 'POWERPLANT', 'AW139'),
('CAU-LIC-60', 'Engine OEI Limit Expire', 'Limite de potência OEI expirado', 'POWERPLANT', 'AW139'),
('WAR-OIL-18', 'Engine Oil Pressure Low', 'Baixa pressão de óleo do motor', 'POWERPLANT', 'AW139'),

-- Categoria: Sistemas Mecânicos (Transmissão/Rotor)
('CAU-MGP-105', 'MGB Chip Detected', 'Limalha detectada na MGB', 'SISTEMAS_MECANICOS', 'AW139'),
('WAR-MGB-30', 'MGB Oil Pressure Low', 'Baixa pressão de óleo na MGB', 'SISTEMAS_MECANICOS', 'AW139'),
('WAR-TMP-30', 'MGB Oil Temp High', 'Alta temperatura de óleo na MGB', 'SISTEMAS_MECANICOS', 'AW139'),
('WAR-TDR-X1', 'Tail Rotor Drive Failure', 'Falha na transmissão do rotor de cauda', 'SISTEMAS_MECANICOS', 'AW139'),
('WAR-TCS-X1', 'Tail Rotor Control Failure', 'Falha no controle do rotor de cauda', 'SISTEMAS_MECANICOS', 'AW139'),
('WAR-MRC-X1', 'Main Rotor Controls Binding', 'Travamento nos controles do rotor principal', 'SISTEMAS_MECANICOS', 'AW139'),
('WAR-TRC-X1', 'Tail Rotor Control Binding', 'Travamento nos controles do rotor de cauda', 'SISTEMAS_MECANICOS', 'AW139'),

-- Categoria: Sistema Elétrico
('CAU-DCG-53', 'Single DC GEN Failure', 'Falha de um gerador DC', 'ELETRICO', 'AW139'),
('WAR-GEN-11', 'Dual DC GEN Failure', 'Falha dupla de geradores DC', 'ELETRICO', 'AW139'),
('CAU-BOF-55', 'Battery Offline', 'Bateria desconectada/offline', 'ELETRICO', 'AW139'),
('CAU-DCB-56', 'DC Bus Failure', 'Falha no barramento DC', 'ELETRICO', 'AW139'),
('WAR-BAT-14', 'Main Battery Overheat', 'Superaquecimento da bateria principal', 'ELETRICO', 'AW139'),
('WAR-AUX-14', 'Aux Battery Overheat', 'Superaquecimento da bateria auxiliar', 'ELETRICO', 'AW139'),

-- Categoria: Fogo e Fumaça
('WAR-CAB-23', 'Cockpit/Cabin Smoke', 'Fumaça na cabine', 'SISTEMAS', 'AW139'),
('WAR-BAG-23', 'Baggage Fire', 'Fogo no bagageiro', 'SISTEMAS', 'AW139'),

-- Categoria: Voo Básico
('FLY-BAS-X1', 'Controle Geral VFR', 'Manobras básicas em condições visuais', 'VOO_BASICO', 'AW139'),
('FLY-BAS-X2', 'Controle Geral IFR', 'Manobras básicas por instrumentos', 'VOO_BASICO', 'AW139'),
('FLY-BAS-X3', 'Hover & Taxi', 'Pairado e taxiamento', 'VOO_BASICO', 'AW139'),
('FLY-BAS-X4', 'Recuperação Atitudes Anormais', 'Recuperação de atitudes anormais', 'VOO_BASICO', 'AW139'),
('FLY-BAS-17', 'Autorotação Completa', 'Prática de autorotação até o solo', 'VOO_BASICO', 'AW139'),

-- Categoria: Procedimentos Normais
('OPS-NRM-X1', 'Procedimentos Normais', 'Checklists e procedimentos padrão', 'PROCEDIMENTOS', 'AW139'),
('OPS-NRM-X2', 'Decolagens & Pousos', 'Técnicas de decolagem e pouso', 'PROCEDIMENTOS', 'AW139'),
('OPS-NRM-X3', 'Circuito de Tráfego', 'Padrão de tráfego visual', 'PROCEDIMENTOS', 'AW139'),

-- Categoria: Navegação e Aproximação
('OPS-OFF-X1', 'Navegação Offshore', 'Navegação para unidades marítimas', 'NAVEGACAO', 'AW139'),
('OPS-OFF-X2', 'Heliponto Approach', 'Aproximação para heliponto/plataforma', 'NAVEGACAO', 'AW139'),
('OPS-APP-X1', 'ILS Approach', 'Aproximação ILS', 'NAVEGACAO', 'AW139'),
('OPS-APP-X2', 'VOR/NDB Approach', 'Aproximação VOR ou NDB', 'NAVEGACAO', 'AW139'),
('OPS-APP-X3', 'Missed Approach', 'Procedimento de aproximação perdida', 'NAVEGACAO', 'AW139'),
('OPS-NAV-X1', 'Navegação FMS & Convencional', 'Uso de sistemas de navegação', 'NAVEGACAO', 'AW139'),
('OPS-NAV-X2', 'Uso AP & Automação', 'Gerenciamento do piloto automático', 'NAVEGACAO', 'AW139'),
('OPS-NAV-X3', 'Holding Pattern', 'Procedimento de espera (órbita)', 'NAVEGACAO', 'AW139'),
('OPS-NAV-X4', 'SID & STAR', 'Saídas e Chegadas padrão', 'NAVEGACAO', 'AW139'),

-- Categoria: AFCS e Aviônicos
('CAU-APF-37', 'AP Failure', 'Falha do Piloto Automático', 'AFCS', 'AW139'),
('CAU-AFD-41', 'AFCS Degraded', 'AFCS em modo degradado', 'AFCS', 'AW139'),
('CAU-AHR-47', 'AHRS Failure', 'Falha de referência de atitude (AHRS)', 'AVIONICOS', 'AW139'),
('CAU-FMS-51', 'FMS Failure', 'Falha do sistema de gerenciamento de voo', 'AVIONICOS', 'AW139'),
('CAU-GPS-52', 'GPS Failure', 'Falha do GPS', 'AVIONICOS', 'AW139'),
('CAU-ADS-46', 'ADS Failure', 'Falha do Air Data System', 'AVIONICOS', 'AW139'),
('CAU-DUD-46', 'Display Unit Degraded', 'Falha ou degradação de tela (DU)', 'AVIONICOS', 'AW139'),
('CAU-APO-38', 'AP OFF', 'Desconexão inadvertida do AP', 'AFCS', 'AW139'),
('CAU-SAS-41', 'SAS Degraded', 'Degradação do sistema de aumento de estabilidade', 'AFCS', 'AW139'),
('CAU-MIS-40', 'MISTRIM', 'Condição de fora de trimagem', 'AFCS', 'AW139'),

-- Categoria: Sistemas Gerais/Hidráulico
('CAU-HYP-77', 'Hydraulic Pressure Low', 'Baixa pressão hidráulica', 'SISTEMAS', 'AW139'),
('CAU-SRV-80', 'Servo Bypass', 'Bypass de servo comando', 'SISTEMAS', 'AW139'),
('WAR-GER-27', 'Landing Gear Emergency', 'Emergência de trem de pouso', 'SISTEMAS', 'AW139'),
('WAR-STA-X1', 'Static Port Obstruction', 'Obstrução de tomada estática', 'SISTEMAS', 'AW139');

-- 3. Criar Modelos de Sessão (Upsert por Codigo)
-- CICLO 1 VFR
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, codigo_aeronave) VALUES
('AW139-C1-VFR', 'SESSÃO VFR - CICLO 1', 'RECORRENTE', 'Ênfase: Dual gen, engine fire, operações offshore', 1, 'AW139')
ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao;

-- CICLO 1 IFR
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, codigo_aeronave) VALUES
('AW139-C1-IFR', 'SESSÃO IFR - CICLO 1', 'RECORRENTE', 'Ênfase: AFCS degraded, ADS fail, servo bypass, gear emergency', 2, 'AW139')
ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao;

-- CICLO 2 VFR
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, codigo_aeronave) VALUES
('AW139-C2-VFR', 'SESSÃO VFR - CICLO 2', 'RECORRENTE', 'Ênfase: Battery overheat, fuel system, emergency shutdown', 3, 'AW139')
ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao;

-- CICLO 2 IFR
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, codigo_aeronave) VALUES
('AW139-C2-IFR', 'SESSÃO IFR - CICLO 2', 'RECORRENTE', 'Ênfase: AHRS fail, GPS fail, gear emergency, holding', 4, 'AW139')
ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao;

-- CICLO 3 VFR
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, codigo_aeronave) VALUES
('AW139-C3-VFR', 'SESSÃO VFR - CICLO 3', 'RECORRENTE', 'Ênfase: Battery overheat, tail rotor, offshore emergencies', 5, 'AW139')
ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao;

-- CICLO 3 IFR
INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, ordem_no_treinamento, codigo_aeronave) VALUES
('AW139-C3-IFR', 'SESSÃO IFR - CICLO 3', 'RECORRENTE', 'Ênfase: MISTRIM, DU degraded, navegação complexa', 6, 'AW139')
ON CONFLICT(codigo) DO UPDATE SET nome=excluded.nome, descricao=excluded.descricao;

-- 4. Vincular Manobras aos Modelos (Limpar anteriores e inserir novos)
-- Função auxiliar não existe em SQLite puro, faremos delete+insert baseado em subqueries

-- --- CICLO 1 VFR ---
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 1 FROM manobras WHERE codigo = 'CAU-HOT-65';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 2 FROM manobras WHERE codigo = 'FLY-BAS-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 3 FROM manobras WHERE codigo = 'OPS-NRM-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 4 FROM manobras WHERE codigo = 'FLY-BAS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 5 FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 6 FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 7 FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 8 FROM manobras WHERE codigo = 'WAR-IDL-16';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 9 FROM manobras WHERE codigo = 'CAU-CST-59';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 10 FROM manobras WHERE codigo = 'CAU-OVS-64';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 11 FROM manobras WHERE codigo = 'WAR-FIR-21';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 12 FROM manobras WHERE codigo = 'FLY-BAS-17';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 13 FROM manobras WHERE codigo = 'WAR-CAB-23';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 14 FROM manobras WHERE codigo = 'CAU-MGP-105';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 15 FROM manobras WHERE codigo = 'WAR-MGB-30';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 16 FROM manobras WHERE codigo = 'WAR-TMP-30';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 17 FROM manobras WHERE codigo = 'CAU-DCG-53';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 18 FROM manobras WHERE codigo = 'WAR-GEN-11';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 19 FROM manobras WHERE codigo = 'OPS-OFF-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 20 FROM manobras WHERE codigo = 'OPS-OFF-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 21 FROM manobras WHERE codigo = 'OPS-APP-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-VFR'), id, 22 FROM manobras WHERE codigo = 'OPS-NRM-X1';

-- --- CICLO 1 IFR ---
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 1 FROM manobras WHERE codigo = 'OPS-NRM-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 2 FROM manobras WHERE codigo = 'FLY-BAS-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 3 FROM manobras WHERE codigo = 'OPS-NAV-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 4 FROM manobras WHERE codigo = 'CAU-APF-37';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 5 FROM manobras WHERE codigo = 'CAU-AFD-41';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 6 FROM manobras WHERE codigo = 'CAU-AHR-47';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 7 FROM manobras WHERE codigo = 'CAU-FMS-51';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 8 FROM manobras WHERE codigo = 'CAU-GPS-52';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 9 FROM manobras WHERE codigo = 'CAU-ADS-46';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 10 FROM manobras WHERE codigo = 'CAU-AHR-47';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 11 FROM manobras WHERE codigo = 'CAU-DUD-46';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 12 FROM manobras WHERE codigo = 'WAR-BAG-23';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 13 FROM manobras WHERE codigo = 'CAU-HYP-77';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 14 FROM manobras WHERE codigo = 'CAU-SRV-80';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 15 FROM manobras WHERE codigo = 'OPS-NAV-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 16 FROM manobras WHERE codigo = 'OPS-NAV-X4';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 17 FROM manobras WHERE codigo = 'OPS-NAV-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 18 FROM manobras WHERE codigo = 'OPS-APP-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 19 FROM manobras WHERE codigo = 'OPS-APP-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 20 FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 21 FROM manobras WHERE codigo = 'WAR-GER-27';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem)
SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C1-IFR'), id, 22 FROM manobras WHERE codigo = 'OPS-APP-X3';

-- --- CICLO 2 VFR ---
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 1 FROM manobras WHERE codigo = 'OPS-NRM-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 2 FROM manobras WHERE codigo = 'CAU-HOT-65';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 3 FROM manobras WHERE codigo = 'FLY-BAS-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 4 FROM manobras WHERE codigo = 'FLY-BAS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 5 FROM manobras WHERE codigo = 'OPS-NRM-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 6 FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 7 FROM manobras WHERE codigo = 'WAR-SHT-19';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 8 FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 9 FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 10 FROM manobras WHERE codigo = 'WAR-EEC-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 11 FROM manobras WHERE codigo = 'WAR-IDL-16';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 12 FROM manobras WHERE codigo = 'WAR-FIR-21';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 13 FROM manobras WHERE codigo = 'CAU-2FP-74';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 14 FROM manobras WHERE codigo = 'CAU-FLO-73';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 15 FROM manobras WHERE codigo = 'CAU-LIC-60';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 16 FROM manobras WHERE codigo = 'OPS-OFF-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 17 FROM manobras WHERE codigo = 'WAR-MGB-30';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 18 FROM manobras WHERE codigo = 'WAR-TMP-30';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 19 FROM manobras WHERE codigo = 'CAU-DCG-53';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 20 FROM manobras WHERE codigo = 'CAU-BOF-55';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 21 FROM manobras WHERE codigo = 'OPS-APP-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-VFR'), id, 22 FROM manobras WHERE codigo = 'FLY-BAS-17';

-- --- CICLO 2 IFR ---
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 1 FROM manobras WHERE codigo = 'OPS-NRM-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 2 FROM manobras WHERE codigo = 'OPS-NAV-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 3 FROM manobras WHERE codigo = 'CAU-APO-38';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 4 FROM manobras WHERE codigo = 'CAU-SAS-41';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 5 FROM manobras WHERE codigo = 'FLY-BAS-X4';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 6 FROM manobras WHERE codigo = 'CAU-AHR-47';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 7 FROM manobras WHERE codigo = 'CAU-GPS-52';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 8 FROM manobras WHERE codigo = 'CAU-DUD-46';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 9 FROM manobras WHERE codigo = 'CAU-FMS-51';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 10 FROM manobras WHERE codigo = 'CAU-DCB-56';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 11 FROM manobras WHERE codigo = 'WAR-CAB-23';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 12 FROM manobras WHERE codigo = 'OPS-NAV-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 13 FROM manobras WHERE codigo = 'OPS-NAV-X4';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 14 FROM manobras WHERE codigo = 'OPS-NAV-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 15 FROM manobras WHERE codigo = 'OPS-APP-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 16 FROM manobras WHERE codigo = 'OPS-APP-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 17 FROM manobras WHERE codigo = 'OPS-APP-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 18 FROM manobras WHERE codigo = 'WAR-OIL-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 19 FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 20 FROM manobras WHERE codigo = 'CAU-HYP-77';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 21 FROM manobras WHERE codigo = 'WAR-GER-27';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C2-IFR'), id, 22 FROM manobras WHERE codigo = 'FLY-BAS-X2';

-- --- CICLO 3 VFR ---
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 1 FROM manobras WHERE codigo = 'OPS-NRM-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 2 FROM manobras WHERE codigo = 'FLY-BAS-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 3 FROM manobras WHERE codigo = 'OPS-NRM-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 4 FROM manobras WHERE codigo = 'OPS-NRM-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 5 FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 6 FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 7 FROM manobras WHERE codigo = 'WAR-EEC-18';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 8 FROM manobras WHERE codigo = 'CAU-OVS-64';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 9 FROM manobras WHERE codigo = 'WAR-FIR-21';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 10 FROM manobras WHERE codigo = 'FLY-BAS-17';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 11 FROM manobras WHERE codigo = 'FLY-BAS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 12 FROM manobras WHERE codigo = 'WAR-BAT-14';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 13 FROM manobras WHERE codigo = 'WAR-AUX-14';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 14 FROM manobras WHERE codigo = 'WAR-STA-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 15 FROM manobras WHERE codigo = 'WAR-TDR-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 16 FROM manobras WHERE codigo = 'WAR-TCS-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 17 FROM manobras WHERE codigo = 'WAR-MRC-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 18 FROM manobras WHERE codigo = 'WAR-TRC-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 19 FROM manobras WHERE codigo = 'CAU-MGP-105';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 20 FROM manobras WHERE codigo = 'WAR-MGB-30';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 21 FROM manobras WHERE codigo = 'OPS-OFF-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-VFR'), id, 22 FROM manobras WHERE codigo = 'WAR-OUT-15';

-- --- CICLO 3 IFR ---
DELETE FROM modelos_sessao_manobras WHERE modelo_id = (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR');
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 1 FROM manobras WHERE codigo = 'OPS-NRM-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 2 FROM manobras WHERE codigo = 'OPS-NAV-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 3 FROM manobras WHERE codigo = 'CAU-APF-37';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 4 FROM manobras WHERE codigo = 'FLY-BAS-X4';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 5 FROM manobras WHERE codigo = 'CAU-ADS-46';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 6 FROM manobras WHERE codigo = 'CAU-DUD-46';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 7 FROM manobras WHERE codigo = 'WAR-CAB-23';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 8 FROM manobras WHERE codigo = 'CAU-GPS-52';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 9 FROM manobras WHERE codigo = 'WAR-TRC-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 10 FROM manobras WHERE codigo = 'WAR-MRC-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 11 FROM manobras WHERE codigo = 'WAR-HIG-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 12 FROM manobras WHERE codigo = 'WAR-LOW-29';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 13 FROM manobras WHERE codigo = 'WAR-OUT-15';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 14 FROM manobras WHERE codigo = 'CAU-SRV-80';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 15 FROM manobras WHERE codigo = 'OPS-NAV-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 16 FROM manobras WHERE codigo = 'OPS-NAV-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 17 FROM manobras WHERE codigo = 'CAU-MIS-40';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 18 FROM manobras WHERE codigo = 'OPS-APP-X2';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 19 FROM manobras WHERE codigo = 'OPS-APP-X1';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 20 FROM manobras WHERE codigo = 'WAR-GER-27';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 21 FROM manobras WHERE codigo = 'OPS-APP-X3';
INSERT INTO modelos_sessao_manobras (modelo_id, manobra_id, ordem) SELECT (SELECT id FROM modelos_sessao WHERE codigo = 'AW139-C3-IFR'), id, 22 FROM manobras WHERE codigo = 'FLY-BAS-X2';
