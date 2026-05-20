-- Migration 0280: Solicitações de Treinamento — PRG-OPS-001
-- Workflow: SOLICITADA → APROVADA_GESTOR → APROVADA_OPS → AGENDADA → CONCLUIDA | REJEITADA

CREATE TABLE IF NOT EXISTS solicitacoes_treinamento (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  empresa_id INTEGER NOT NULL,
  
  -- Quem solicita
  solicitante_id INTEGER NOT NULL,        -- FK funcionarios
  
  -- Treinamento
  qualificacao_id INTEGER,                -- FK qualificacoes_tipos (se for qualificação específica)
  tipo_treinamento TEXT NOT NULL,         -- INICIAL | RECORRENTE | UPGRADE | ESPECIFICO
  titulo TEXT NOT NULL,
  descricao TEXT,
  justificativa TEXT,
  
  -- Workflow
  status TEXT NOT NULL DEFAULT 'SOLICITADA', -- SOLICITADA | APROVADA_GESTOR | APROVADA_OPS | AGENDADA | CONCLUIDA | REJEITADA
  aprovado_gestor_por INTEGER,            -- FK funcionarios
  aprovado_gestor_em TEXT,
  aprovado_ops_por INTEGER,               -- FK funcionarios
  aprovado_ops_em TEXT,
  motivo_rejeicao TEXT,
  rejeitado_por INTEGER,
  rejeitado_em TEXT,
  
  -- Agendamento (pós aprovação)
  data_prevista TEXT,                     -- YYYY-MM-DD
  data_realizada TEXT,                    -- YYYY-MM-DD
  sessao_simulador_id TEXT,              -- FK simulador_agendamentos (se aplicável)
  
  -- Prioridade
  prioridade TEXT NOT NULL DEFAULT 'NORMAL', -- BAIXA | NORMAL | ALTA | URGENTE
  
  -- Audit
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sol_trein_empresa ON solicitacoes_treinamento(empresa_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sol_trein_solicitante ON solicitacoes_treinamento(solicitante_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sol_trein_status ON solicitacoes_treinamento(status) WHERE deleted_at IS NULL;
