-- AirTrust - Seed Consolidado (Schema + Data)
-- Created: 2025-11-14
-- Usage: wrangler d1 execute airtrust-db --file=./seed.sql

-- ===== SCHEMA =====

-- Funcionários
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  cargo TEXT NOT NULL,
  setor TEXT NOT NULL,
  funcao TEXT,
  codigo_anac TEXT,
  ativo INTEGER DEFAULT 1,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_ativo ON funcionarios(ativo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);

-- Qualificações Tipos
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  codigo TEXT NOT NULL UNIQUE,
  categoria TEXT NOT NULL,
  descricao TEXT,
  validade_meses INTEGER NOT NULL DEFAULT 12,
  obrigatoria INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;

-- Qualificações Historico
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  qualificacao_id INTEGER NOT NULL,
  data_obtencao TEXT NOT NULL,
  data_validade TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'VALIDA',
  certificado_url TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_func ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qual ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_validade ON qualificacoes_historico(data_validade) WHERE deleted_at IS NULL;

-- Simuladores
CREATE TABLE IF NOT EXISTS simuladores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,
  fabricante TEXT NOT NULL,
  tipo TEXT NOT NULL,
  codigo TEXT NOT NULL UNIQUE,
  ativo INTEGER DEFAULT 1,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_simuladores_codigo ON simuladores(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_simuladores_ativo ON simuladores(ativo) WHERE deleted_at IS NULL;

-- Sessões Simulador
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulador_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  checador_id INTEGER,
  data_sessao TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL,
  tipo_sessao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'AGENDADA',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (checador_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_sim ON sessoes_simulador(simulador_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_data ON sessoes_simulador(data_sessao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_status ON sessoes_simulador(status) WHERE deleted_at IS NULL;

-- Participantes Sessão
CREATE TABLE IF NOT EXISTS participantes_sessao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  funcao TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_participantes_sessao_sessao ON participantes_sessao(sessao_id);
CREATE INDEX IF NOT EXISTS idx_participantes_sessao_func ON participantes_sessao(funcionario_id);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id INTEGER,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- ===== SEED DATA =====

-- 10 Funcionários
INSERT INTO funcionarios (id, matricula, nome, cpf, email, telefone, cargo, setor, funcao, codigo_anac, ativo, is_instrutor, is_checador) VALUES
(1, '001', 'João Silva', '111.111.111-11', 'joao.silva@airtrust.com', '(11) 98765-4321', 'Comandante', 'Operações', 'PIC', 'ANAC12345', 1, 1, 0),
(2, '002', 'Maria Santos', '222.222.222-22', 'maria.santos@airtrust.com', '(11) 98765-4322', 'Copiloto', 'Operações', 'SIC', 'ANAC12346', 1, 0, 0),
(3, '003', 'Pedro Costa', '333.333.333-33', 'pedro.costa@airtrust.com', '(11) 98765-4323', 'Instrutor', 'Treinamento', 'INVA', 'ANAC12347', 1, 1, 1),
(4, '004', 'Ana Oliveira', '444.444.444-44', 'ana.oliveira@airtrust.com', '(11) 98765-4324', 'Copiloto', 'Operações', 'SIC', 'ANAC12348', 1, 0, 0),
(5, '005', 'Carlos Pereira', '555.555.555-55', 'carlos.pereira@airtrust.com', '(11) 98765-4325', 'Comandante', 'Operações', 'PIC', 'ANAC12349', 1, 1, 0),
(6, '006', 'Juliana Lima', '666.666.666-66', 'juliana.lima@airtrust.com', '(11) 98765-4326', 'Checador', 'Treinamento', 'INVA', 'ANAC12350', 1, 0, 1),
(7, '007', 'Roberto Alves', '777.777.777-77', 'roberto.alves@airtrust.com', '(11) 98765-4327', 'Comandante', 'Operações', 'PIC', 'ANAC12351', 1, 0, 0),
(8, '008', 'Fernanda Rocha', '888.888.888-88', 'fernanda.rocha@airtrust.com', '(11) 98765-4328', 'Copiloto', 'Operações', 'SIC', 'ANAC12352', 1, 0, 0),
(9, '009', 'Lucas Martins', '999.999.999-99', 'lucas.martins@airtrust.com', '(11) 98765-4329', 'Instrutor', 'Treinamento', 'INVA', 'ANAC12353', 1, 1, 1),
(10, '010', 'Beatriz Souza', '101.010.101-01', 'beatriz.souza@airtrust.com', '(11) 98765-4330', 'Comandante', 'Operações', 'PIC', 'ANAC12354', 1, 0, 0);

-- 8 Qualificações Tipos
INSERT INTO qualificacoes_tipos (id, nome, codigo, categoria, descricao, validade_meses, obrigatoria) VALUES
(1, 'Habilitação A320', 'HAB-A320', 'Habilitação', 'Habilitação de tipo para A320', 12, 1),
(2, 'Habilitação B737', 'HAB-B737', 'Habilitação', 'Habilitação de tipo para B737', 12, 1),
(3, 'CRM Cockpit Resource Management', 'CRM-BASIC', 'Treinamento', 'Gerenciamento de recursos de cabine', 24, 1),
(4, 'Dangerous Goods', 'DG-IATA', 'Regulatório', 'Transporte de cargas perigosas', 24, 1),
(5, 'SEP Single Engine Piston', 'SEP-BASIC', 'Habilitação', 'Monomotor pistão', 12, 0),
(6, 'MEP Multi Engine Piston', 'MEP-BASIC', 'Habilitação', 'Multimotor pistão', 12, 0),
(7, 'IFR Instrument Flight Rules', 'IFR-RATING', 'Habilitação', 'Voo por instrumentos', 12, 1),
(8, 'RVSM Reduced Vertical Separation Minimum', 'RVSM-OPS', 'Regulatório', 'Separação vertical reduzida', 24, 1);

-- 15 Qualificações Historico
INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, data_obtencao, data_validade, status, certificado_url, observacoes) VALUES
(1, 1, 1, '2024-01-15', '2025-01-15', 'VALIDA', 'https://r2.airtrust.com/cert/001-hab-a320.pdf', 'Primeira habilitação'),
(2, 1, 3, '2024-02-10', '2026-02-10', 'VALIDA', 'https://r2.airtrust.com/cert/001-crm.pdf', 'CRM inicial'),
(3, 1, 7, '2023-11-05', '2024-11-05', 'EXPIRADA', 'https://r2.airtrust.com/cert/001-ifr.pdf', 'Renovação pendente'),
(4, 2, 1, '2024-03-20', '2025-03-20', 'VALIDA', 'https://r2.airtrust.com/cert/002-hab-a320.pdf', 'Copiloto A320'),
(5, 2, 4, '2024-04-12', '2026-04-12', 'VALIDA', 'https://r2.airtrust.com/cert/002-dg.pdf', 'Dangerous Goods'),
(6, 3, 2, '2023-12-01', '2024-12-01', 'EXPIRADA', 'https://r2.airtrust.com/cert/003-hab-b737.pdf', 'Revalidação necessária'),
(7, 3, 3, '2024-05-15', '2026-05-15', 'VALIDA', 'https://r2.airtrust.com/cert/003-crm.pdf', 'CRM instrutor'),
(8, 4, 1, '2024-06-10', '2025-06-10', 'VALIDA', 'https://r2.airtrust.com/cert/004-hab-a320.pdf', 'Upgrade SIC'),
(9, 5, 2, '2024-01-20', '2025-01-20', 'VALIDA', 'https://r2.airtrust.com/cert/005-hab-b737.pdf', 'Type rating B737'),
(10, 5, 8, '2024-02-15', '2026-02-15', 'VALIDA', 'https://r2.airtrust.com/cert/005-rvsm.pdf', 'RVSM completo'),
(11, 6, 1, '2024-07-01', '2025-07-01', 'VALIDA', 'https://r2.airtrust.com/cert/006-hab-a320.pdf', 'Checador A320'),
(12, 7, 2, '2024-03-10', '2025-03-10', 'VALIDA', 'https://r2.airtrust.com/cert/007-hab-b737.pdf', 'Comandante B737'),
(13, 8, 1, '2024-08-05', '2025-08-05', 'VALIDA', 'https://r2.airtrust.com/cert/008-hab-a320.pdf', 'Copiloto A320'),
(14, 9, 2, '2024-04-15', '2025-04-15', 'VALIDA', 'https://r2.airtrust.com/cert/009-hab-b737.pdf', 'Instrutor B737'),
(15, 10, 1, '2024-09-01', '2025-09-01', 'VALIDA', 'https://r2.airtrust.com/cert/010-hab-a320.pdf', 'Comandante A320');

-- 3 Simuladores
INSERT INTO simuladores (id, modelo, fabricante, tipo, codigo, ativo, observacoes) VALUES
(1, 'A320', 'Airbus', 'FULL_FLIGHT', 'SIM-A320-001', 1, 'Simulador de voo completo A320'),
(2, 'B737-800', 'Boeing', 'FULL_FLIGHT', 'SIM-B737-001', 1, 'Simulador de voo completo B737-800'),
(3, 'A320', 'CAE', 'FIXED_BASE', 'SIM-A320-002', 1, 'Simulador base fixa A320');

-- 12 Sessões Simulador
INSERT INTO sessoes_simulador (id, simulador_id, instrutor_id, checador_id, data_sessao, duracao_minutos, tipo_sessao, status, observacoes) VALUES
(1, 1, 1, NULL, '2024-11-01 08:00:00', 240, 'RECURRENT', 'CONCLUIDA', 'Treinamento recorrente A320'),
(2, 1, 3, NULL, '2024-11-02 14:00:00', 180, 'TYPE_RATING', 'CONCLUIDA', 'Type rating inicial'),
(3, 2, 5, 6, '2024-11-03 09:00:00', 240, 'PROFICIENCY_CHECK', 'CONCLUIDA', 'Proficiency check B737'),
(4, 1, 1, NULL, '2024-11-04 10:00:00', 120, 'LINE_ORIENTED', 'CONCLUIDA', 'LOFT scenario'),
(5, 3, 3, NULL, '2024-11-05 08:00:00', 180, 'RECURRENT', 'CONCLUIDA', 'Recorrente base fixa'),
(6, 2, 9, NULL, '2024-11-06 13:00:00', 240, 'UPGRADE', 'CONCLUIDA', 'Upgrade para comandante'),
(7, 1, 1, 6, '2024-11-07 09:00:00', 180, 'PROFICIENCY_CHECK', 'CONCLUIDA', 'PC anual'),
(8, 2, 5, NULL, '2024-11-08 14:00:00', 240, 'RECURRENT', 'CONCLUIDA', 'Treinamento recorrente B737'),
(9, 1, 3, NULL, '2024-11-09 08:00:00', 120, 'LINE_ORIENTED', 'CONCLUIDA', 'LOFT cenário complexo'),
(10, 3, 1, NULL, '2024-11-10 10:00:00', 180, 'TYPE_RATING', 'AGENDADA', 'Type rating agendado'),
(11, 2, 9, 6, '2024-11-11 09:00:00', 240, 'PROFICIENCY_CHECK', 'AGENDADA', 'PC programado'),
(12, 1, 3, NULL, '2024-11-12 14:00:00', 180, 'RECURRENT', 'AGENDADA', 'Próximo recorrente');

-- 13 Participantes Sessão
INSERT INTO participantes_sessao (id, sessao_id, funcionario_id, funcao) VALUES
(1, 1, 2, 'PF'),
(2, 2, 4, 'ALUNO'),
(3, 3, 7, 'PF'),
(4, 4, 2, 'PF'),
(5, 4, 4, 'PM'),
(6, 5, 8, 'PF'),
(7, 6, 7, 'ALUNO'),
(8, 7, 2, 'PF'),
(9, 8, 7, 'PF'),
(10, 9, 4, 'PF'),
(11, 10, 8, 'ALUNO'),
(12, 11, 10, 'PF'),
(13, 12, 2, 'PF');
