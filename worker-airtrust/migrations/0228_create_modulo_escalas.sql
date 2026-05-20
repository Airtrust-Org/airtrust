-- ================================================================
-- Migration 0228: Módulo de Planejamento de Escala Mensal
-- Data: 2026-03-04
-- Objetivo: Criar tabelas para escalas mensais, tripulações,
--           eventos, restrições e auditoria de escala
-- ================================================================

-- 1. Padrões de Escala (15x15, 7x7, etc.) - configurável por empresa
CREATE TABLE IF NOT EXISTS padroes_escala (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  dias_trabalho INTEGER NOT NULL,
  dias_folga INTEGER NOT NULL,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 2. Escala Mensal (container principal)
CREATE TABLE IF NOT EXISTS escalas_mensais (
  id TEXT PRIMARY KEY,
  mes INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
  ano INTEGER NOT NULL CHECK (ano >= 2024 AND ano <= 2035),
  titulo TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','em_revisao','aprovada','publicada')),
  aprovado_por TEXT,
  aprovado_em TEXT,
  publicado_por TEXT,
  publicado_em TEXT,
  observacoes TEXT,
  empresa_id INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_escalas_mensais_mes_ano_empresa
  ON escalas_mensais(mes, ano, empresa_id) WHERE deleted_at IS NULL;

-- 3. Tripulações da Escala (agrupamento PIC + SIC por período)
CREATE TABLE IF NOT EXISTS escala_tripulacoes (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  pic_id TEXT NOT NULL,
  sic_id TEXT,
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  padrao_escala_id TEXT,
  aeronave TEXT,
  base TEXT,
  restricoes TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_escala_tripulacoes_escala ON escala_tripulacoes(escala_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escala_tripulacoes_pic ON escala_tripulacoes(pic_id) WHERE deleted_at IS NULL;

-- 4. Eventos/Alocações da Escala (cada dia/bloco de um tripulante)
CREATE TABLE IF NOT EXISTS escala_eventos (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  tripulacao_id TEXT,
  funcionario_id TEXT NOT NULL,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'voo','viagem','treinamento_solo','treinamento_simulador',
    'medico','cheque','reaquisi','trabalho','folga',
    'standby','ferias','licenca'
  )),
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  turno TEXT DEFAULT 'dia_todo' CHECK (turno IN ('manha','tarde','noite','dia_todo')),
  local TEXT,
  aeronave TEXT,
  simulador_id TEXT,
  certificacao_id TEXT,
  gerado_automaticamente INTEGER DEFAULT 0,
  motivo_automatico TEXT,
  status TEXT DEFAULT 'confirmado' CHECK (status IN ('confirmado','pendente','cancelado')),
  observacoes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_escala_eventos_escala ON escala_eventos(escala_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escala_eventos_funcionario ON escala_eventos(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_escala_eventos_datas ON escala_eventos(data_inicio, data_fim) WHERE deleted_at IS NULL;

-- 5. Restrições de Tripulação (quem pode/não pode voar com quem)
CREATE TABLE IF NOT EXISTS restricoes_tripulacao (
  id TEXT PRIMARY KEY,
  funcionario_a_id TEXT NOT NULL,
  funcionario_b_id TEXT NOT NULL,
  tipo_restricao TEXT NOT NULL CHECK (tipo_restricao IN ('nao_pode_voar_junto','preferencial','contratual')),
  motivo TEXT,
  contrato_referencia TEXT,
  data_inicio TEXT,
  data_fim TEXT,
  ativo INTEGER DEFAULT 1,
  empresa_id INTEGER,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_restricoes_tripulacao_a ON restricoes_tripulacao(funcionario_a_id) WHERE deleted_at IS NULL AND ativo = 1;
CREATE INDEX IF NOT EXISTS idx_restricoes_tripulacao_b ON restricoes_tripulacao(funcionario_b_id) WHERE deleted_at IS NULL AND ativo = 1;

-- 6. Log de alterações da escala (auditoria)
CREATE TABLE IF NOT EXISTS escala_auditoria (
  id TEXT PRIMARY KEY,
  escala_id TEXT NOT NULL,
  evento_id TEXT,
  acao TEXT NOT NULL,
  campo_alterado TEXT,
  valor_anterior TEXT,
  valor_novo TEXT,
  justificativa TEXT,
  realizado_por TEXT NOT NULL,
  realizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_escala_auditoria_escala ON escala_auditoria(escala_id);

-- 7. Seed de padrões de escala iniciais
INSERT OR IGNORE INTO padroes_escala (id, nome, dias_trabalho, dias_folga, descricao, ativo, created_at, updated_at)
VALUES
  ('padrao-15x15', '15x15', 15, 15, 'Quinze dias de trabalho, quinze de folga', 1, datetime('now'), datetime('now')),
  ('padrao-7x7',   '7x7',    7,  7, 'Sete dias de trabalho, sete de folga',      1, datetime('now'), datetime('now')),
  ('padrao-14x14', '14x14', 14, 14, 'Quatorze dias de trabalho, quatorze de folga', 1, datetime('now'), datetime('now')),
  ('padrao-21x21', '21x21', 21, 21, 'Vinte e um dias de trabalho, vinte e um de folga', 1, datetime('now'), datetime('now')),
  ('padrao-standby', 'Standby', 0, 0, 'Regime de sobreaviso / standby', 1, datetime('now'), datetime('now'));
