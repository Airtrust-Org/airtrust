-- Migration: Sistema de Notificações
-- Data: 2026-02-06
-- Descrição: Notificações em tempo real para operadores sobre eventos do sistema
--
-- Casos de uso:
-- - Webhook EdApp processa treinamento → notificação automática
-- - Qualificação vencendo → notificação preventiva
-- - Certificado emitido → notificação de confirmação
--
-- Features:
-- - Agrupamento de notificações (múltiplos treinamentos EdApp juntos)
-- - Prioridade (BAIXA, MEDIA, ALTA, URGENTE)
-- - Lida/Não lida
-- - Soft delete

CREATE TABLE IF NOT EXISTS notificacoes_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Tipo de notificação
  tipo TEXT NOT NULL, -- 'EDAPP_QUALIFICACAO', 'QUALIFICACAO_VENCENDO', 'CERTIFICADO_EMITIDO', etc
  prioridade TEXT DEFAULT 'MEDIA', -- 'BAIXA', 'MEDIA', 'ALTA', 'URGENTE'
  
  -- Conteúdo
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  
  -- Dados estruturados (JSON)
  dados TEXT, -- {"funcionario_id": 1, "qualificacao_codigo": "E5", "data_conclusao": "2026-02-06"}
  
  -- Agrupamento
  grupo TEXT, -- "edapp_batch_2026-02-06_11:30" para agrupar múltiplas notificações
  
  -- Referências (opcionais)
  funcionario_id INTEGER,
  qualificacao_historico_id INTEGER,
  
  -- Ações
  link TEXT, -- "/qualificacoes?id=123" para abrir direto
  acao_primaria TEXT, -- "Ver Qualificação", "Emitir Certificado"
  
  -- Estado
  lida INTEGER DEFAULT 0, -- 0 = não lida, 1 = lida
  lida_em TEXT, -- timestamp quando foi marcada como lida
  lida_por INTEGER, -- user_id que marcou como lida
  
  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes_sistema(lida, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON notificacoes_sistema(tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_grupo ON notificacoes_sistema(grupo);
CREATE INDEX IF NOT EXISTS idx_notificacoes_deleted ON notificacoes_sistema(deleted_at);

-- View para notificações não lidas
CREATE VIEW IF NOT EXISTS notificacoes_nao_lidas AS
SELECT 
  n.*,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula
FROM notificacoes_sistema n
LEFT JOIN funcionarios f ON f.id = n.funcionario_id
WHERE n.lida = 0 
  AND n.deleted_at IS NULL
ORDER BY 
  CASE n.prioridade
    WHEN 'URGENTE' THEN 1
    WHEN 'ALTA' THEN 2
    WHEN 'MEDIA' THEN 3
    WHEN 'BAIXA' THEN 4
    ELSE 5
  END,
  n.created_at DESC;
