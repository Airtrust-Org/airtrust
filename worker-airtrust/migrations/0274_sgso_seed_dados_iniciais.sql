-- ============================================================
-- Migration: 0274_sgso_seed_dados_iniciais.sql
-- Módulo: SGSO — Seed de dados de referência
-- Descrição: Categorias ADREP, taxonomia HFACS e SPIs default
-- IMPORTANTE: Execute após 0271, 0272 e 0273
-- Autor: AirTrust Engineering
-- Data: 2026-03-15
-- ============================================================

-- ------------------------------------------------------------
-- Tabela de categorias ADREP (ICAO/ECCAIRS)
-- Usada no formulário de relato para classificar a ocorrência
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sgso_categorias_adrep (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,                   -- Ex: BIRD_STRIKE
  nome_pt TEXT NOT NULL,                         -- Nome em português
  nome_en TEXT,                                  -- Nome em inglês (referência ICAO)
  categoria_pai_id INTEGER,                      -- Hierarquia (NULL = categoria raiz)
  ativo INTEGER DEFAULT 1
);

-- Categorias raiz ADREP (principais para helicópteros offshore)
INSERT OR IGNORE INTO sgso_categorias_adrep (codigo, nome_pt, nome_en) VALUES
  ('BIRD_STRIKE',           'Colisão com pássaro (bird strike)',        'Bird Strike'),
  ('ENGINE_FAILURE',        'Falha de motor',                           'Engine Failure/Malfunction'),
  ('HYDRAULIC_FAILURE',     'Falha de sistema hidráulico',              'Hydraulic System Failure'),
  ('ELECTRICAL_FAILURE',    'Falha de sistema elétrico',                'Electrical System Failure'),
  ('ROTOR_VIBRATION',       'Vibração anormal de rotor',                'Rotor Vibration'),
  ('TAIL_ROTOR_EVENT',      'Evento relacionado ao rotor de cauda',     'Tail Rotor Event'),
  ('HOIST_OPERATION',       'Evento em operação de içamento (guincho)', 'Hoist Operation Event'),
  ('OFFSHORE_APPROACH',     'Evento em aproximação offshore',           'Offshore Approach Event'),
  ('BROWNOUT_WHITEOUT',     'Brownout / Whiteout',                      'Brownout/Whiteout'),
  ('WIRE_STRIKE',           'Colisão com fios/cabos',                   'Wire Strike'),
  ('CFIT',                  'Colisão com solo em voo controlado (CFIT)','CFIT'),
  ('LOSS_CONTROL',          'Perda de controle em voo',                 'Loss of Control in Flight'),
  ('RUNWAY_INCURSION',      'Incursão de pista',                        'Runway Incursion'),
  ('FUEL_MANAGEMENT',       'Gestão de combustível',                    'Fuel Management'),
  ('NAVIGATION_ERROR',      'Erro de navegação',                        'Navigation Error'),
  ('COMMUNICATION_ERROR',   'Falha / erro de comunicação',              'Communication Failure'),
  ('WEATHER_ENCOUNTER',     'Encontro com condição meteorológica adversa','Adverse Weather Encounter'),
  ('FOD',                   'Dano por objeto estranho (FOD)',            'Foreign Object Damage'),
  ('MAINTENANCE_EVENT',     'Evento relacionado a manutenção',          'Maintenance Event'),
  ('GROUND_HANDLING',       'Evento em manuseio em solo',               'Ground Handling Event'),
  ('CREW_INCAPACITATION',   'Incapacitação de tripulante',              'Crew Incapacitation'),
  ('AIRSPACE_INFRINGEMENT', 'Infração de espaço aéreo',                 'Airspace Infringement'),
  ('NEAR_MISS',             'Quase colisão (AIRPROX)',                  'Near Miss / AIRPROX'),
  ('EMERGENCY_DECLARED',    'Declaração de emergência',                 'Emergency Declared'),
  ('HARD_LANDING',          'Pouso forçado / pouso duro',               'Hard Landing'),
  ('OFFSHORE_DECK',         'Evento no convés da plataforma',           'Offshore Deck Event'),
  ('SECURITY_EVENT',        'Evento de segurança (security)',           'Security Event'),
  ('FATIGUE_REPORT',        'Relato de fadiga',                         'Fatigue Report'),
  ('HUMAN_ERROR',           'Erro humano (genérico)',                   'Human Error'),
  ('PROCEDURE_DEVIATION',   'Desvio de procedimento',                   'Procedure Deviation'),
  ('CARGO_EVENT',           'Evento relacionado a carga/passageiros',   'Cargo/Passenger Event'),
  ('OTHER',                 'Outro / Não classificado',                 'Other');

-- ------------------------------------------------------------
-- Seed de SPIs default para novas empresas
-- Inserir para empresa_id=6 (Costa do Sol) como referência
-- Para onboarding de novos tenants: copiar este seed com o novo empresa_id
-- ------------------------------------------------------------
INSERT OR IGNORE INTO sgso_spi_config
  (empresa_id, codigo, nome, descricao, unidade, meta_valor, meta_operador, alerta_valor, alerta_operador)
VALUES
  -- Taxa de relatos: quanto maior, mais saudável a cultura de segurança
  (6, 'TAXA_RELATOS',
   'Taxa de Relatos',
   'Número de relatos por 100 horas de voo. Indica saúde da cultura de segurança.',
   'relatos/100h', 2.0, '>=', 1.0, '<'),

  -- Ocorrências sérias devem ser baixas
  (6, 'TAXA_OCORRENCIAS_SERIAS',
   'Taxa de Ocorrências Sérias',
   'Incidentes graves e acidentes por 1.000 horas de voo.',
   'por 1.000h', 1.5, '<=', 3.0, '>'),

  -- Ações de mitigação devem ser fechadas no prazo
  (6, 'FECHAMENTO_ACOES',
   'Fechamento de Ações no Prazo',
   'Percentual de ações CAPA encerradas dentro do prazo definido.',
   '%', 80.0, '>=', 60.0, '<'),

  -- NCs em aberto por mais de 30 dias são preocupantes
  (6, 'NCS_ABERTAS_30D',
   'Não Conformidades Abertas > 30 dias',
   'Quantidade de NCs sem resolução há mais de 30 dias.',
   'quantidade', 3.0, '<=', 5.0, '>'),

  -- Auditorias precisam ser executadas conforme programado
  (6, 'EXECUCAO_AUDITORIAS',
   'Execução de Auditorias Programadas',
   'Percentual de auditorias realizadas sobre as programadas no período.',
   '%', 90.0, '>=', 70.0, '<'),

  -- Efetividade cognitiva média da frota (integração FRMS)
  (6, 'EFETIVIDADE_COGNITIVA_MEDIA',
   'Efetividade Cognitiva Média da Frota',
   'Média do score de efetividade cognitiva (FRMS) dos tripulantes ativos nos últimos 28 dias.',
   'score (0-100)', 75.0, '>=', 65.0, '<'),

  -- % de relatos anônimos — excesso pode indicar medo de represálias
  (6, 'RELATOS_ANONIMOS_PERC',
   'Percentual de Relatos Anônimos',
   'Percentual de relatos feitos de forma anônima. Valores muito altos (>70%) podem indicar clima de medo.',
   '%', 30.0, '<=', 70.0, '>');
