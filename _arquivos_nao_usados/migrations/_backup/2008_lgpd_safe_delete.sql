-- ETAPA 2: LGPD Safe Delete Implementation
-- Adiciona infraestrutura segura para exclusão de dados conforme LGPD/GDPR
-- Data: 2025-11-02

-- ============================================================
-- 1. Tabela de Solicitações de Exclusão LGPD
-- ============================================================
CREATE TABLE IF NOT EXISTS lgpd_exclusao_solicitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificação
  funcionario_id INTEGER NOT NULL,
  
  -- Auditoria
  solicitado_por INTEGER,
  solicitado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  aprovado_por INTEGER,
  aprovado_em TIMESTAMP,
  
  -- Status e Detalhes
  status TEXT NOT NULL DEFAULT 'PENDENTE',
  motivo TEXT,
  observacoes TEXT,
  
  -- Soft Delete
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (solicitado_por) REFERENCES usuarios(id),
  FOREIGN KEY (aprovado_por) REFERENCES usuarios(id),
  CHECK (status IN ('PENDENTE', 'APROVADO', 'REJEITADO', 'EXECUTADO', 'CANCELADO'))
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lgpd_status ON lgpd_exclusao_solicitacoes(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_lgpd_funcionario ON lgpd_exclusao_solicitacoes(funcionario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_lgpd_data ON lgpd_exclusao_solicitacoes(solicitado_em DESC);

-- ============================================================
-- 2. Tabela de Backup de Dados Excluídos
-- ============================================================
CREATE TABLE IF NOT EXISTS funcionarios_backup_exclusao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Rastreabilidade
  funcionario_original_id INTEGER NOT NULL,
  solicitacao_id INTEGER NOT NULL,
  
  -- Dados (em JSON para flexibilidade)
  dados_json TEXT NOT NULL,
  tipo_dado TEXT DEFAULT 'funcionario', -- funcionario, qualificacao, exame, etc
  
  -- Auditoria
  backed_up_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  motivo TEXT DEFAULT 'LGPD Right to be Forgotten (Art. 18, VI)',
  
  -- Soft Delete (permite restauração se necessário)
  deleted_at TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (solicitacao_id) REFERENCES lgpd_exclusao_solicitacoes(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_backup_exclusao_solicitacao ON funcionarios_backup_exclusao(solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_backup_exclusao_funcionario ON funcionarios_backup_exclusao(funcionario_original_id);

-- ============================================================
-- 3. Tabela de Log de Execução de Hard Delete
-- ============================================================
CREATE TABLE IF NOT EXISTS lgpd_hard_delete_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Solicitação
  solicitacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  
  -- Execução
  executado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executado_por TEXT DEFAULT 'SYSTEM',
  
  -- Resultado
  sucesso BOOLEAN DEFAULT TRUE,
  tabelas_afetadas TEXT, -- JSON com contagem por tabela
  registros_deletados INTEGER,
  erros TEXT,
  
  -- Detalhes
  backup_criado BOOLEAN DEFAULT TRUE,
  backup_verificado BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (solicitacao_id) REFERENCES lgpd_exclusao_solicitacoes(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_hard_delete_log_data ON lgpd_hard_delete_log(executado_em DESC);

-- ============================================================
-- 4. Tabela de Notificações LGPD
-- ============================================================
CREATE TABLE IF NOT EXISTS lgpd_notificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificação
  solicitacao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  
  -- Tipo de Notificação
  tipo TEXT NOT NULL, -- 'SOLICITACAO_RECEBIDA', 'APROVACAO_PENDENTE', 'EXCLUSAO_EXECUTADA', 'ERRO'
  destinatario TEXT NOT NULL, -- email ou user_id
  
  -- Conteúdo
  assunto TEXT NOT NULL,
  mensagem TEXT,
  link_detalhes TEXT,
  
  -- Status
  enviada BOOLEAN DEFAULT FALSE,
  enviada_em TIMESTAMP,
  lida BOOLEAN DEFAULT FALSE,
  lida_em TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  FOREIGN KEY (solicitacao_id) REFERENCES lgpd_exclusao_solicitacoes(id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON lgpd_notificacoes(tipo, enviada);
CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario ON lgpd_notificacoes(destinatario);

-- ============================================================
-- 5. Triggers para Auditoria
-- ============================================================

-- Atualizar updated_at quando solicitação é modificada
CREATE TRIGGER IF NOT EXISTS trig_lgpd_solicitacoes_updated_at
AFTER UPDATE ON lgpd_exclusao_solicitacoes
FOR EACH ROW
BEGIN
  UPDATE lgpd_exclusao_solicitacoes 
  SET updated_at = CURRENT_TIMESTAMP 
  WHERE id = NEW.id;
END;

-- ============================================================
-- 6. View para Dashboard DPO
-- ============================================================
CREATE VIEW IF NOT EXISTS vw_lgpd_solicitacoes_pendentes AS
SELECT 
  s.id,
  s.funcionario_id,
  f.nome as funcionario_nome,
  f.email as funcionario_email,
  s.status,
  s.solicitado_em,
  DATETIME('now', '-48 hours') as prazo_limite,
  CASE 
    WHEN datetime(s.solicitado_em, '+48 hours') < datetime('now') THEN 'URGENTE'
    WHEN datetime(s.solicitado_em, '+48 hours') < datetime('now', '+24 hours') THEN 'PRÓXIMO'
    ELSE 'OK'
  END as urgencia,
  s.motivo,
  u.name as solicitado_por_nome
FROM lgpd_exclusao_solicitacoes s
LEFT JOIN funcionarios f ON s.funcionario_id = f.id
LEFT JOIN usuarios u ON s.solicitado_por = u.id
WHERE s.status = 'PENDENTE' AND s.deleted_at IS NULL
ORDER BY s.solicitado_em ASC;
