-- Migration 0362: solicitacoes de edicao pos-finalizacao de fichas de simulador
-- Objetivo: permitir que o instrutor solicite alteracao de observacoes em ficha finalizada,
-- com aprovacao de gestor e trilha completa de auditoria, sem afetar qualificacoes geradas.

CREATE TABLE IF NOT EXISTS fichas_sessao_edicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL,
  empresa_id INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA')),

  solicitante_usuario_id TEXT,
  solicitante_funcionario_id INTEGER NOT NULL,
  motivo TEXT NOT NULL,

  snapshot_antes_json TEXT NOT NULL,
  alteracoes_json TEXT NOT NULL,

  aprovador_usuario_id TEXT,
  decisao_observacoes TEXT,
  aprovado_em TEXT,
  rejeitado_em TEXT,

  ip_address TEXT,
  user_agent TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,

  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id),
  FOREIGN KEY (solicitante_funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_fichas_edicoes_ficha_status
  ON fichas_sessao_edicoes(ficha_id, status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_fichas_edicoes_empresa_status
  ON fichas_sessao_edicoes(empresa_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fichas_edicoes_solicitante
  ON fichas_sessao_edicoes(solicitante_funcionario_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fichas_edicoes_uma_pendente_por_ficha
  ON fichas_sessao_edicoes(ficha_id)
  WHERE status = 'PENDENTE' AND deleted_at IS NULL;
