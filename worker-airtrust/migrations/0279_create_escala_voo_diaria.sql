-- Migration 0279: Módulo EVD (Escala de Voo Diária) — PRC-OPS-009
-- Tabela principal para escala diária de voos derivada da EST mensal

CREATE TABLE IF NOT EXISTS escala_voo_diaria (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  escala_id TEXT,                         -- FK opcional para escalas (EST mensal)
  data TEXT NOT NULL,                     -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'RASCUNHO',-- RASCUNHO | PUBLICADA | CANCELADA
  
  -- Tripulação
  pic_id INTEGER,                         -- FK funcionarios
  sic_id INTEGER,                         -- FK funcionarios
  pic_funcao TEXT,                        -- PIC / IN / EC
  sic_funcao TEXT,                        -- SIC / IN / EC
  
  -- Aeronave
  aeronave_prefixo TEXT,
  aeronave_modelo TEXT,
  
  -- Horários operacionais
  hora_apresentacao TEXT,                 -- HH:MM
  hora_decolagem_prevista TEXT,           -- HH:MM
  hora_pouso_previsto TEXT,               -- HH:MM
  hora_decolagem_real TEXT,               -- HH:MM (preenchido pós-voo)
  hora_pouso_real TEXT,                   -- HH:MM (preenchido pós-voo)
  hora_corte_motor TEXT,                  -- HH:MM (preenchido pós-voo)
  
  -- Repouso
  repouso_anterior_minutos INTEGER,       -- minutos desde último corte motor
  repouso_minimo_ok INTEGER DEFAULT 1,    -- 1 = ≥ 12h30, 0 = violação
  
  -- Rota / missão
  origem TEXT,                            -- ICAO / base
  destino TEXT,                           -- ICAO / base / plataforma
  tipo_missao TEXT DEFAULT 'OFFSHORE',    -- OFFSHORE | INSTRUCAO | CHECK | FERRY | OUTRO
  
  -- Observações
  observacoes TEXT,
  
  -- Audit
  criado_por INTEGER,                     -- FK funcionarios (quem elaborou)
  aprovado_por INTEGER,                   -- FK funcionarios (gestor ops)
  aprovado_em TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_evd_empresa_data ON escala_voo_diaria(empresa_id, data) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evd_escala ON escala_voo_diaria(escala_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evd_pic ON escala_voo_diaria(pic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evd_sic ON escala_voo_diaria(sic_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evd_status ON escala_voo_diaria(status) WHERE deleted_at IS NULL;
