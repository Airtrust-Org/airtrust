-- ==========================================
-- MIGRATION 0172: Módulo de Treinamentos Planejados
-- Data: 2026-01-08
-- Objetivo: Criar estrutura para planejamento de treinamentos futuros
-- ==========================================

-- ==========================================
-- 1. TABELA PRINCIPAL: treinamentos_planejados
-- ==========================================
CREATE TABLE IF NOT EXISTS treinamentos_planejados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  
  -- Tipo de treinamento (referência ao tipo de qualificação)
  qualificacao_tipo_id INTEGER NOT NULL,
  
  -- Datas e horários
  data_prevista TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fim TEXT,
  
  -- Status do ciclo de vida
  status TEXT NOT NULL DEFAULT 'PLANEJADO' 
    CHECK(status IN ('PLANEJADO', 'CONFIRMADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO')),
  
  -- Instrutor responsável
  instrutor_id INTEGER,
  
  -- Recursos opcionais
  simulador_id INTEGER,
  aeronave_id INTEGER,
  local TEXT,
  
  -- Carga horária
  carga_horaria_prevista INTEGER,
  
  -- Descrição e observações
  titulo TEXT,
  descricao TEXT,
  observacoes TEXT,
  motivo_cancelamento TEXT,
  
  -- Efetivação
  efetivado_em TEXT,
  efetivado_por INTEGER,
  sessao_id INTEGER,
  
  -- Auditoria
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (efetivado_por) REFERENCES usuarios(id),
  FOREIGN KEY (created_by) REFERENCES usuarios(id)
);

-- ==========================================
-- 2. TABELA DE PARTICIPANTES
-- ==========================================
CREATE TABLE IF NOT EXISTS treinamentos_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  
  -- Status individual do participante
  confirmado INTEGER DEFAULT 0,
  presente INTEGER,
  
  -- Resultado após efetivação
  aprovado INTEGER,
  nota REAL,
  observacoes TEXT,
  
  -- Referência à qualificação gerada na efetivação
  qualificacao_historico_id INTEGER,
  
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id),
  UNIQUE(treinamento_id, funcionario_id)
);

-- ==========================================
-- 3. ÍNDICES PARA PERFORMANCE
-- ==========================================

-- Índice principal por status (mais usado em filtros)
CREATE INDEX IF NOT EXISTS idx_treinamentos_status 
ON treinamentos_planejados(status) WHERE deleted_at IS NULL;

-- Índice por data (para queries de calendário e dashboard)
CREATE INDEX IF NOT EXISTS idx_treinamentos_data 
ON treinamentos_planejados(data_prevista) WHERE deleted_at IS NULL;

-- Índice por empresa (multi-tenant)
CREATE INDEX IF NOT EXISTS idx_treinamentos_empresa 
ON treinamentos_planejados(empresa_id) WHERE deleted_at IS NULL;

-- Índice por instrutor (para verificar conflitos de agenda)
CREATE INDEX IF NOT EXISTS idx_treinamentos_instrutor 
ON treinamentos_planejados(instrutor_id) WHERE deleted_at IS NULL;

-- Índice composto para queries frequentes
CREATE INDEX IF NOT EXISTS idx_treinamentos_empresa_data_status 
ON treinamentos_planejados(empresa_id, data_prevista, status) WHERE deleted_at IS NULL;

-- Índice para participantes
CREATE INDEX IF NOT EXISTS idx_treinamentos_participantes_treinamento 
ON treinamentos_participantes(treinamento_id);

CREATE INDEX IF NOT EXISTS idx_treinamentos_participantes_funcionario 
ON treinamentos_participantes(funcionario_id);

-- ==========================================
-- 4. TRIGGER PARA ATUALIZAR updated_at
-- ==========================================
CREATE TRIGGER IF NOT EXISTS trg_treinamentos_planejados_updated_at
AFTER UPDATE ON treinamentos_planejados
FOR EACH ROW
BEGIN
  UPDATE treinamentos_planejados 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_treinamentos_participantes_updated_at
AFTER UPDATE ON treinamentos_participantes
FOR EACH ROW
BEGIN
  UPDATE treinamentos_participantes 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

-- ==========================================
-- 5. VALIDAÇÃO
-- ==========================================
SELECT 'Migration 0172: Tabelas de treinamentos planejados criadas com sucesso' AS resultado;
