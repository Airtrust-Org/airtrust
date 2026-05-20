-- Migration: Criar tabelas de sessões de simulador
-- Data: 23/10/2025
-- Descrição: Sistema completo de fichas de avaliação de simulador

-- Tabela principal de sessões
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  simulador_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME,
  tipo_sessao TEXT CHECK(tipo_sessao IN ('TREINAMENTO', 'RECORRENTE', 'CHECK', 'OUTRO')),
  status TEXT DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

-- Participantes da sessão
CREATE TABLE IF NOT EXISTS sessoes_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcao_sessao TEXT NOT NULL CHECK(funcao_sessao IN ('PILOTO', 'COPILOTO', 'OBSERVADOR', 'AVALIADOR')),
  template_padrao TEXT,
  ordem INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- Manobras da sessão
CREATE TABLE IF NOT EXISTS sessoes_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  resultado TEXT CHECK(resultado IN ('SATISFATORIO', 'INSATISFATORIO', 'NAO_AVALIADO')),
  observacoes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sessoes_uuid ON sessoes_simulador(uuid);
CREATE INDEX IF NOT EXISTS idx_sessoes_data ON sessoes_simulador(data DESC);
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador ON sessoes_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_instrutor ON sessoes_simulador(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_status ON sessoes_simulador(status);
CREATE INDEX IF NOT EXISTS idx_participantes_sessao ON sessoes_participantes(sessao_id);
CREATE INDEX IF NOT EXISTS idx_participantes_funcionario ON sessoes_participantes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_manobras_sessao ON sessoes_manobras(sessao_id);
CREATE INDEX IF NOT EXISTS idx_manobras_manobra ON sessoes_manobras(manobra_id);
