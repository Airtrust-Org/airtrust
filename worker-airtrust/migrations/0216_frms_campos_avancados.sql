-- Migration 0216: FRMS — Campos avançados de jornada e fatorização
-- Adiciona campos operacionais à tabela frms_jornada e
-- campos de fator base/aclimatação à tabela frms_fatorizacao_jornada.

-- Tipo de base (HOME = base própria, AWAY = base diferente do domicílio)
ALTER TABLE frms_jornada ADD COLUMN tipo_base TEXT DEFAULT 'HOME' CHECK (tipo_base IN ('HOME', 'AWAY'));

-- Tripulação aumentada (0 = normal, 1 = tripulação reforçada — aumenta FDP máximo)
ALTER TABLE frms_jornada ADD COLUMN tripulacao_aumentada INTEGER DEFAULT 0;

-- Classe cabine para posicionamento / repouso em voo
ALTER TABLE frms_jornada ADD COLUMN classe_cabine TEXT DEFAULT NULL CHECK (classe_cabine IN ('ECONOMY', 'BUSINESS', NULL));

-- Aclimatado à base de operação (1 = sim, 0 = não — impacta fatorização)
ALTER TABLE frms_jornada ADD COLUMN aclimatado INTEGER DEFAULT 1;

-- Fator de penalidade por operação AWAY (% do total fatorizado)
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN fator_base_away_pct REAL DEFAULT 0;

-- Fator de penalidade por não-aclimatação (% do total fatorizado)
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN fator_aclimatacao_pct REAL DEFAULT 0;

-- Seed: novos parâmetros de configuração
INSERT OR IGNORE INTO frms_configuracao_limites
  (id, nome, valor_numerico, unidade, descricao, ativo, created_at, updated_at)
VALUES
  ('cfg_fator_base_away',    'FATOR_BASE_AWAY_PCT',       0.10, 'pct',   'Penalidade AWAY — base diferente do domicílio',         1, datetime('now'), datetime('now')),
  ('cfg_fator_aclimatado_nao','FATOR_ACLIMATADO_NAO_PCT', 0.10, 'pct',   'Penalidade por não-aclimatação à base de operação',     1, datetime('now'), datetime('now')),
  ('cfg_fator_tripulacao_aum','FATOR_TRIPULACAO_AUM_HORAS',2.0, 'horas', 'Extensão do FDP máximo para tripulação aumentada (h)', 1, datetime('now'), datetime('now'));
