-- ========================================
-- Migration: 0146_historico_notas_manobras.sql
-- Propósito: Controlar desempenho histórico de alunos por manobra
-- Data: 2025-12-04
-- ========================================

-- ========================================
-- TABELA: historico_notas_manobras
-- Propósito: Armazenar todas as notas de cada manobra por funcionário
-- ========================================
CREATE TABLE IF NOT EXISTS historico_notas_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificação
  funcionario_id INTEGER NOT NULL,
  ficha_id INTEGER NOT NULL,
  codigo_manobra TEXT NOT NULL,
  descricao_manobra TEXT NOT NULL,
  categoria_manobra TEXT,
  
  -- Avaliação
  nota REAL NOT NULL CHECK (nota >= 0 AND nota <= 10),
  observacoes TEXT,
  
  -- Contexto da sessão
  data_sessao TEXT NOT NULL,
  tipo_sessao TEXT NOT NULL,
  tipo_aeronave TEXT,
  instrutor_id INTEGER,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  -- Foreign Keys
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (ficha_id) REFERENCES fichas_sessao(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_historico_notas_funcionario 
  ON historico_notas_manobras(funcionario_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_historico_notas_manobra 
  ON historico_notas_manobras(funcionario_id, codigo_manobra, deleted_at);

CREATE INDEX IF NOT EXISTS idx_historico_notas_data 
  ON historico_notas_manobras(data_sessao DESC, deleted_at);

CREATE INDEX IF NOT EXISTS idx_historico_notas_ficha 
  ON historico_notas_manobras(ficha_id, deleted_at);

-- Índice composto para query de "última nota"
CREATE INDEX IF NOT EXISTS idx_historico_ultima_nota 
  ON historico_notas_manobras(funcionario_id, codigo_manobra, data_sessao DESC, deleted_at);

-- ========================================
-- TABELA: alertas_reforco
-- Propósito: Registrar alertas de necessidade de reforço
-- (2 sessões consecutivas com nota < 7.0)
-- ========================================
CREATE TABLE IF NOT EXISTS alertas_reforco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  funcionario_id INTEGER NOT NULL,
  codigo_manobra TEXT NOT NULL,
  descricao_manobra TEXT NOT NULL,
  
  -- Critério de alerta (2 sessões consecutivas < 7.0)
  nota_sessao1 REAL NOT NULL,
  data_sessao1 TEXT NOT NULL,
  ficha_id_sessao1 INTEGER NOT NULL,
  
  nota_sessao2 REAL NOT NULL,
  data_sessao2 TEXT NOT NULL,
  ficha_id_sessao2 INTEGER NOT NULL,
  
  -- Status do alerta
  status TEXT NOT NULL DEFAULT 'ATIVO', -- ATIVO | RESOLVIDO | IGNORADO
  instrutor_notificado INTEGER NOT NULL DEFAULT 0, -- 0 = não, 1 = sim
  data_notificacao TEXT,
  instrutor_id_notificado INTEGER,
  
  -- Resolução
  data_resolucao TEXT,
  nota_resolucao REAL,
  ficha_id_resolucao INTEGER,
  observacoes_resolucao TEXT,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id_notificado) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_alertas_funcionario 
  ON alertas_reforco(funcionario_id, status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_alertas_status 
  ON alertas_reforco(status, deleted_at);

CREATE INDEX IF NOT EXISTS idx_alertas_instrutor 
  ON alertas_reforco(instrutor_id_notificado, status, deleted_at);

-- ========================================
-- TRIGGER: Atualizar updated_at automaticamente
-- ========================================
CREATE TRIGGER IF NOT EXISTS trg_historico_notas_updated_at
AFTER UPDATE ON historico_notas_manobras
FOR EACH ROW
BEGIN
  UPDATE historico_notas_manobras 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_alertas_reforco_updated_at
AFTER UPDATE ON alertas_reforco
FOR EACH ROW
BEGIN
  UPDATE alertas_reforco 
  SET updated_at = datetime('now') 
  WHERE id = NEW.id;
END;
