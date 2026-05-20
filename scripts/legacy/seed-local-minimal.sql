-- Schema mínimo + dados de teste
-- Baseado no schema de produção

PRAGMA foreign_keys = OFF;

-- Tabela funcionarios
CREATE TABLE IF NOT EXISTS funcionarios (
  id TEXT PRIMARY KEY,
  matricula TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  funcao TEXT,
  endereco TEXT,
  telefone TEXT,
  escala TEXT,
  status TEXT DEFAULT 'ATIVO',
  is_instrutor BOOLEAN DEFAULT 0,
  is_checador BOOLEAN DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  codigo_anac TEXT,
  cargo TEXT
);

-- Tabela qualificacoes_tipos (catálogo de tipos de qualificação)
CREATE TABLE IF NOT EXISTS qualificacoes_tipos (
  id TEXT PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  categoria TEXT,
  tipo TEXT, -- TREINAMENTO/EXAME/CHECK
  descricao TEXT,
  validade_meses INTEGER,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL
);

-- Tabela qualificacoes_historico (histórico de qualificações por funcionário)
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id TEXT PRIMARY KEY,
  funcionario_id TEXT NOT NULL,
  qualificacao_id TEXT NOT NULL, -- FK para qualificacoes_tipos.id
  data_conclusao TEXT,
  data_vencimento TEXT,
  status TEXT DEFAULT 'VIGENTE',
  observacoes TEXT,
  certificado_url TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id)
);

-- Tabela usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nome TEXT NOT NULL,
  perfil TEXT DEFAULT 'USUARIO',
  funcionario_id TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

-- Dados de teste
INSERT INTO funcionarios (id, matricula, nome, cpf, email, funcao, status, is_instrutor, cargo) VALUES
('1', 'MAT001', 'João Silva', '111.111.111-11', 'joao@airtrust.com', 'PILOTO', 'ATIVO', 1, 'Piloto Comandante'),
('2', 'MAT002', 'Maria Santos', '222.222.222-22', 'maria@airtrust.com', 'COPILOTO', 'ATIVO', 0, 'Copiloto'),
('3', 'MAT003', 'Pedro Oliveira', '333.333.333-33', 'pedro@airtrust.com', 'INSTRUTOR', 'ATIVO', 1, 'Instrutor de Voo'),
('4', 'MAT004', 'Ana Costa', '444.444.444-44', 'ana@airtrust.com', 'CHECADOR', 'ATIVO', 1, 'Checador'),
('5', 'MAT005', 'Carlos Souza', '555.555.555-55', 'carlos@airtrust.com', 'MECÂNICO', 'ATIVO', 0, 'Mecânico de Aeronaves');

-- Tipos de qualificação (catálogo)
INSERT INTO qualificacoes_tipos (id, codigo, nome, categoria, tipo, validade_meses) VALUES
('QT1', 'TRE001', 'Curso Inicial A320', 'FORMAÇÃO', 'TREINAMENTO', 12),
('QT2', 'CHK001', 'Check Anual A320', 'PROFICIÊNCIA', 'CHECK', 12),
('QT3', 'TRE002', 'Curso Inicial B737', 'FORMAÇÃO', 'TREINAMENTO', 12),
('QT4', 'TRE003', 'Formação de Instrutor', 'INSTRUÇÃO', 'TREINAMENTO', 24),
('QT5', 'CHK002', 'Check de Checador', 'PROFICIÊNCIA', 'CHECK', 12),
('QT6', 'TRE004', 'Manutenção de Aeronaves', 'TÉCNICO', 'TREINAMENTO', 24);

-- Histórico de qualificações (por funcionário)
INSERT INTO qualificacoes_historico (id, funcionario_id, qualificacao_id, data_conclusao, data_vencimento, status) VALUES
('QH1', '1', 'QT1', '2024-01-15', '2025-01-15', 'VIGENTE'),
('QH2', '1', 'QT2', '2024-06-01', '2025-06-01', 'VIGENTE'),
('QH3', '2', 'QT3', '2024-02-20', '2025-02-20', 'VIGENTE'),
('QH4', '3', 'QT4', '2023-03-10', '2025-03-10', 'VIGENTE'),
('QH5', '4', 'QT5', '2024-04-15', '2025-04-15', 'VIGENTE'),
('QH6', '5', 'QT6', '2024-01-05', '2026-01-05', 'VIGENTE');

-- Usuário admin para teste (senha: admin123 - hash fictício)
INSERT INTO usuarios (email, password_hash, nome, perfil, funcionario_id, ativo) VALUES
('admin@airtrust.com', '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890', 'Administrador', 'ADMIN', '1', 1);

PRAGMA foreign_keys = ON;
