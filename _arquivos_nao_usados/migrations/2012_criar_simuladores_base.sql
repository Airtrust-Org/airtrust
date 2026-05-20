-- ==========================================
-- Migration 2012: Criar tabelas base simuladores
-- ==========================================

PRAGMA foreign_keys = OFF;

-- ==========================================
-- 1. SIMULADORES
-- ==========================================
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  tipo TEXT CHECK(tipo IN ('FIXED', 'GENERIC', 'ADVANCED')) DEFAULT 'GENERIC',
  modelo TEXT,
  fabricante TEXT,
  serie TEXT,
  localizacao TEXT DEFAULT 'Base Principal',
  capacidade INTEGER DEFAULT 2,
  status TEXT CHECK(status IN ('OPERACIONAL', 'MANUTENCAO', 'DESATIVADO')) DEFAULT 'OPERACIONAL',
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_simuladores_codigo ON simuladores(codigo);
CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status);
CREATE INDEX IF NOT EXISTS idx_simuladores_deleted ON simuladores(deleted_at);

-- ==========================================
-- 2. AGENDAMENTOS SIMULADOR
-- ==========================================
CREATE TABLE IF NOT EXISTS agendamentos_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  checador_id INTEGER,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME,
  duracao_minutos INTEGER,
  tipo_sessao TEXT CHECK(tipo_sessao IN ('TREINAMENTO', 'VERIFICACAO', 'AVALIACAO', 'RECICLAGEM')) DEFAULT 'TREINAMENTO',
  status TEXT CHECK(status IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'ADIADA')) DEFAULT 'AGENDADA',
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (checador_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_instrutor ON agendamentos_simulador(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos_simulador(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos_simulador(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_deleted ON agendamentos_simulador(deleted_at);

-- ==========================================
-- 3. FICHAS (Sessões do Simulador com Avaliações)
-- ==========================================
CREATE TABLE IF NOT EXISTS fichas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  agendamento_id INTEGER,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  data_sessao DATE NOT NULL,
  hora_inicio TIME,
  hora_fim TIME,
  duracao_minutos INTEGER,
  status TEXT CHECK(status IN ('RASCUNHO', 'EM_AVALIACAO', 'APROVADO', 'REPROVADO', 'CANCELADO')) DEFAULT 'RASCUNHO',
  nota_final REAL,
  observacoes TEXT,
  assinatura_instrutor BOOLEAN DEFAULT 0,
  assinatura_instrutor_data TIMESTAMP,
  assinatura_instrutor_hash TEXT,
  assinatura_instrutor_protocolo TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_tripulante BOOLEAN DEFAULT 0,
  assinatura_tripulante_data TIMESTAMP,
  assinatura_tripulante_hash TEXT,
  assinatura_tripulante_protocolo TEXT,
  assinatura_tripulante_ip TEXT,
  assinatura_checador BOOLEAN DEFAULT 0,
  assinatura_checador_data TIMESTAMP,
  assinatura_checador_hash TEXT,
  assinatura_checador_protocolo TEXT,
  assinatura_checador_ip TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos_simulador(id),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_fichas_uuid ON fichas(uuid);
CREATE INDEX IF NOT EXISTS idx_fichas_simulador ON fichas(simulador_id);
CREATE INDEX IF NOT EXISTS idx_fichas_funcionario ON fichas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fichas_instrutor ON fichas(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_data ON fichas(data_sessao);
CREATE INDEX IF NOT EXISTS idx_fichas_status ON fichas(status);
CREATE INDEX IF NOT EXISTS idx_fichas_deleted ON fichas(deleted_at);

-- ==========================================
-- 4. HABILITACOES (Licenças de Funcionários)
-- ==========================================
CREATE TABLE IF NOT EXISTS habilitacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  data_obtencao DATE,
  data_vencimento DATE,
  orgao_emissor TEXT,
  numero_certificado TEXT,
  status TEXT CHECK(status IN ('ATIVA', 'VENCIDA', 'SUSPENSA', 'CANCELADA')) DEFAULT 'ATIVA',
  observacoes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario ON habilitacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_vencimento ON habilitacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_status ON habilitacoes(status);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_deleted ON habilitacoes(deleted_at);

-- ==========================================
-- 5. MANOBRAS (Procedimentos de Voo)
-- ==========================================
CREATE TABLE IF NOT EXISTS manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT CHECK(categoria IN ('NORMAL', 'ANORMAL', 'EMERGENCIA')) DEFAULT 'NORMAL',
  nivel_dificuldade TEXT CHECK(nivel_dificuldade IN ('BASICO', 'INTERMEDIARIO', 'AVANCADO')) DEFAULT 'BASICO',
  duracao_estimada INTEGER DEFAULT 30,
  pontuacao_minima REAL DEFAULT 70.0,
  ordem INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

INSERT OR IGNORE INTO manobras (codigo, nome, descricao, categoria, nivel_dificuldade, ordem) VALUES
('MAN-001', 'Decolagem Normal', 'Procedimento de decolagem em condições normais', 'NORMAL', 'BASICO', 1),
('MAN-002', 'Pouso Normal', 'Procedimento de pouso em condições normais', 'NORMAL', 'BASICO', 2),
('MAN-003', 'Falha Motor Decolagem', 'Procedimento emergência falha motor na decolagem', 'EMERGENCIA', 'AVANCADO', 3),
('MAN-004', 'Aproximação ILS', 'Aproximação por instrumentos ILS', 'NORMAL', 'INTERMEDIARIO', 4),
('MAN-005', 'Estol e Recuperação', 'Procedimento estol e recuperação controlada', 'ANORMAL', 'AVANCADO', 5),
('MAN-006', 'Circuito Visual', 'Circuito de tráfego visual', 'NORMAL', 'BASICO', 6),
('MAN-007', 'Aproximação Perdida', 'Procedimento de arremetida', 'ANORMAL', 'INTERMEDIARIO', 7),
('MAN-008', 'Pouso Emergência', 'Pouso sem trem principais', 'EMERGENCIA', 'AVANCADO', 8),
('MAN-009', 'Voo IFR', 'Voo por instrumentos completo', 'NORMAL', 'INTERMEDIARIO', 9),
('MAN-010', 'Falha Hidráulica', 'Procedimento falha sistema hidráulico', 'EMERGENCIA', 'AVANCADO', 10);

CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria);
CREATE INDEX IF NOT EXISTS idx_manobras_nivel ON manobras(nivel_dificuldade);
CREATE INDEX IF NOT EXISTS idx_manobras_deleted ON manobras(deleted_at);

-- ==========================================
-- 6. FICHAS MANOBRAS (Avaliação de cada manobra)
-- ==========================================
CREATE TABLE IF NOT EXISTS fichas_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER DEFAULT 1,
  nota REAL,
  observacoes TEXT,
  executada BOOLEAN DEFAULT 0,
  tempo_execucao INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (ficha_id) REFERENCES fichas(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id)
);

CREATE INDEX IF NOT EXISTS idx_fichas_manobras_ficha ON fichas_manobras(ficha_id);
CREATE INDEX IF NOT EXISTS idx_fichas_manobras_manobra ON fichas_manobras(manobra_id);
CREATE INDEX IF NOT EXISTS idx_fichas_manobras_deleted ON fichas_manobras(deleted_at);

PRAGMA foreign_keys = ON;

SELECT 'Migration 2012 - Simuladores base schema criado' as status;
