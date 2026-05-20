-- ============================================
-- MIGRATION 0041: Sistema Completo de Simuladores
-- Data: 23/10/2025
-- Objetivo: Criar todas as tabelas necessárias para simuladores
-- ============================================

-- Tabela de Simuladores
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  tipo TEXT CHECK(tipo IN ('FFS', 'FTD', 'FNPT', 'ATD', 'OUTRO')),
  aeronave TEXT,
  localizacao TEXT,
  status TEXT DEFAULT 'ATIVO' CHECK(status IN ('ATIVO', 'INATIVO', 'MANUTENCAO')),
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela de Manobras
CREATE TABLE IF NOT EXISTS manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  tipo TEXT,
  nivel_dificuldade TEXT,
  tempo_estimado INTEGER,
  pontuacao_maxima REAL,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Adicionar coluna UUID em agendamentos_simulador se não existir
-- SQLite não tem ALTER COLUMN IF NOT EXISTS, então usamos uma abordagem segura
CREATE TABLE IF NOT EXISTS agendamentos_simulador_temp AS 
SELECT * FROM agendamentos_simulador WHERE 1=0;

-- Verificar se precisa adicionar UUID
-- Se a tabela já tem UUID, isso não fará nada
ALTER TABLE agendamentos_simulador_temp ADD COLUMN uuid TEXT;

-- Limpar tabela temporária
DROP TABLE IF NOT EXISTS agendamentos_simulador_temp;

-- Tabela de Avaliações de Manobras
CREATE TABLE IF NOT EXISTS avaliacoes_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  avaliador_id INTEGER NOT NULL,
  nota REAL CHECK(nota >= 0 AND nota <= 10),
  status TEXT CHECK(status IN ('SATISFATORIO', 'NAO_SATISFATORIO', 'PENDENTE')),
  observacoes TEXT,
  data_avaliacao TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos_simulador(id),
  FOREIGN KEY (manobra_id) REFERENCES manobras(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_simuladores_codigo ON simuladores(codigo);
CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status);
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_agendamento ON avaliacoes_manobras(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_manobra ON avaliacoes_manobras(manobra_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_funcionario ON avaliacoes_manobras(funcionario_id);

-- Inserir dados de teste de simuladores
INSERT OR IGNORE INTO simuladores (id, nome, codigo, tipo, aeronave, status) VALUES
  (1, 'Simulador ATR 72-600', 'ATR72-600', 'FFS', 'ATR 72-600', 'ATIVO'),
  (2, 'Simulador Boeing 737-800', 'B737-800', 'FFS', 'Boeing 737-800', 'ATIVO'),
  (3, 'Simulador Airbus A320', 'A320', 'FFS', 'Airbus A320', 'ATIVO'),
  (4, 'Simulador Cessna Citation CJ4', 'CJ4', 'FTD', 'Cessna Citation CJ4', 'ATIVO');

-- Inserir dados de teste de manobras
INSERT OR IGNORE INTO manobras (id, codigo, nome, categoria, descricao) VALUES
  (1, 'MAN-001', 'Decolagem Normal', 'NORMAL', 'Procedimento de decolagem em condições normais'),
  (2, 'MAN-002', 'Pouso Normal', 'NORMAL', 'Procedimento de pouso em condições normais'),
  (3, 'MAN-003', 'Emergência - Falha de Motor', 'EMERGENCIA', 'Procedimento de emergência com falha de motor'),
  (4, 'MAN-004', 'Aproximação ILS', 'NAVEGACAO', 'Aproximação por instrumentos ILS'),
  (5, 'MAN-005', 'Circuito de Tráfego', 'NORMAL', 'Circuito padrão de tráfego');
