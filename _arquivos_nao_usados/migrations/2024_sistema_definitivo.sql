-- ==========================================
-- AIRTRUST SISTEMA DEFINITIVO - MIGRACAO COMPLETA
-- Data: 2025-10-16
-- Tolerancia: ZERO
-- ==========================================

-- ==========================================
-- 1. SIMULADORES: Adicionar colunas faltantes
-- ==========================================
ALTER TABLE simuladores ADD COLUMN codigo TEXT;
ALTER TABLE simuladores ADD COLUMN localizacao TEXT DEFAULT 'Base Principal';
ALTER TABLE simuladores ADD COLUMN capacidade INTEGER DEFAULT 2;

-- Atualizar registros sem codigo
UPDATE simuladores 
SET codigo = 'SIM-' || printf('%03d', id) 
WHERE codigo IS NULL OR codigo = '';

-- ==========================================
-- 2. MANOBRAS: Criar tabela completa
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed manobras padrao
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

-- ==========================================
-- 3. SESSOES SIMULADOR: Criar tabela
-- ==========================================
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  simulador_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  aluno_id INTEGER,
  checador_id INTEGER,
  data DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME,
  duracao INTEGER,
  tipo_sessao TEXT CHECK(tipo_sessao IN ('TREINAMENTO', 'VERIFICACAO', 'AVALIACAO', 'RECICLAGEM')) DEFAULT 'TREINAMENTO',
  status TEXT CHECK(status IN ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA', 'ADIADA')) DEFAULT 'AGENDADA',
  observacoes TEXT,
  nota_final REAL,
  aprovado BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (aluno_id) REFERENCES funcionarios(id),
  FOREIGN KEY (checador_id) REFERENCES funcionarios(id)
);

-- Relacao manobras sessao
CREATE TABLE IF NOT EXISTS sessao_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 1,
  nota REAL,
  observacoes TEXT,
  executada BOOLEAN DEFAULT 0,
  tempo_execucao INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id)
);

-- ==========================================
-- 4. TIPOS QUALIFICACOES: Criar tabela
-- ==========================================
CREATE TABLE IF NOT EXISTS tipos_qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT CHECK(categoria IN ('MEDICO', 'TECNICO', 'LICENCA', 'HABILITACAO', 'CERTIFICADO')) DEFAULT 'TECNICO',
  validade_meses INTEGER DEFAULT 12,
  obrigatorio BOOLEAN DEFAULT 0,
  ativo BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed tipos qualificacoes padrao
INSERT OR IGNORE INTO tipos_qualificacoes (codigo, nome, descricao, categoria, validade_meses, obrigatorio) VALUES
('CMA1', 'Certificado Médico Aeronáutico Classe 1', 'CMA Classe 1 para pilotos comerciais', 'MEDICO', 12, 1),
('CMA2', 'Certificado Médico Aeronáutico Classe 2', 'CMA Classe 2 para pilotos privados', 'MEDICO', 24, 1),
('CHT', 'Certificado de Habilitação Técnica', 'CHT para mecânicos e técnicos', 'TECNICO', 24, 1),
('LIC_PCH', 'Licença Piloto Comercial Helicóptero', 'Licença PCH emitida pela ANAC', 'LICENCA', 60, 1),
('LIC_PCA', 'Licença Piloto Comercial Avião', 'Licença PCA emitida pela ANAC', 'LICENCA', 60, 1),
('LIC_PLA', 'Licença Piloto de Linha Aérea', 'Licença PLA emitida pela ANAC', 'LICENCA', 60, 1),
('LIC_MMA', 'Licença Mecânico Manutenção Aeronáutica', 'Licença MMA emitida pela ANAC', 'LICENCA', 60, 1),
('HAB_A320', 'Habilitação de Tipo Airbus A320', 'Habilitação tipo A320 família', 'HABILITACAO', 12, 1),
('HAB_B737', 'Habilitação de Tipo Boeing 737', 'Habilitação tipo B737 família', 'HABILITACAO', 12, 1),
('HAB_E190', 'Habilitação de Tipo Embraer 190', 'Habilitação tipo E190/E195', 'HABILITACAO', 12, 1),
('HAB_IFR', 'Habilitação de Voo por Instrumentos', 'Habilitação IFR', 'HABILITACAO', 24, 1),
('CERT_CRM', 'Certificado CRM Crew Resource Management', 'Certificado CRM obrigatório', 'CERTIFICADO', 24, 1),
('CERT_DG', 'Certificado Dangerous Goods', 'Certificado transporte mercadorias perigosas', 'CERTIFICADO', 24, 0);

-- ==========================================
-- 5. LIMPAR FUNCOES DUPLICADAS
-- ==========================================
-- Manter apenas as 5 primeiras
DELETE FROM funcoes WHERE id > 5;

-- ==========================================
-- 6. CRIAR INDICES PERFORMANCE
-- ==========================================

-- Indices Simuladores
CREATE INDEX IF NOT EXISTS idx_simuladores_codigo ON simuladores(codigo);
CREATE INDEX IF NOT EXISTS idx_simuladores_status ON simuladores(status);
CREATE INDEX IF NOT EXISTS idx_simuladores_tipo ON simuladores(tipo);

-- Indices Manobras
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria);
CREATE INDEX IF NOT EXISTS idx_manobras_nivel ON manobras(nivel_dificuldade);

-- Indices Sessoes
CREATE INDEX IF NOT EXISTS idx_sessoes_data ON sessoes_simulador(data);
CREATE INDEX IF NOT EXISTS idx_sessoes_simulador ON sessoes_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_instrutor ON sessoes_simulador(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_aluno ON sessoes_simulador(aluno_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_status ON sessoes_simulador(status);
CREATE INDEX IF NOT EXISTS idx_sessoes_tipo ON sessoes_simulador(tipo_sessao);

-- Indices Sessao Manobras
CREATE INDEX IF NOT EXISTS idx_sessao_manobras_sessao ON sessao_manobras(sessao_id);
CREATE INDEX IF NOT EXISTS idx_sessao_manobras_manobra ON sessao_manobras(manobra_id);

-- Indices Funcionarios
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email);
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_funcao ON funcionarios(funcao);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_base ON funcionarios(base);

-- Indices Certificacoes
CREATE INDEX IF NOT EXISTS idx_certificacoes_funcionario ON certificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_certificacoes_treinamento ON certificacoes(treinamento_id);
CREATE INDEX IF NOT EXISTS idx_certificacoes_validade ON certificacoes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_certificacoes_status ON certificacoes(status);

-- Indices Qualificacoes
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_categoria ON qualificacoes(categoria);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes(data_validade);

-- Indices Treinamentos
CREATE INDEX IF NOT EXISTS idx_treinamentos_categoria ON treinamentos(categoria);
CREATE INDEX IF NOT EXISTS idx_treinamentos_ativo ON treinamentos(ativo);
CREATE INDEX IF NOT EXISTS idx_treinamentos_codigo ON treinamentos(codigo);

-- Indices Tipos Qualificacoes
CREATE INDEX IF NOT EXISTS idx_tipos_qual_codigo ON tipos_qualificacoes(codigo);
CREATE INDEX IF NOT EXISTS idx_tipos_qual_categoria ON tipos_qualificacoes(categoria);
