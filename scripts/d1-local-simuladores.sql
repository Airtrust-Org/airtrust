-- ============================================================
-- D1 LOCAL BOOTSTRAP: Tabelas e dados mínimos para Simuladores
-- Uso: wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file scripts/d1-local-simuladores.sql
-- ============================================================

PRAGMA foreign_keys=ON;

-- Cria tabela de participantes da sessão (nome esperado pelas rotas)
CREATE TABLE IF NOT EXISTS sessoes_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  papel TEXT NOT NULL CHECK(papel IN ('ALUNO','INSTRUTOR','EXAMINADOR')),
  presenca TEXT DEFAULT 'PENDENTE' CHECK(presenca IN ('PENDENTE','PRESENTE','FALTA')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_sess_part_sessao ON sessoes_participantes(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sess_part_funcionario ON sessoes_participantes(funcionario_id) WHERE deleted_at IS NULL;

-- Cadastro de manobras (templates)
CREATE TABLE IF NOT EXISTS cadastro_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo_sessao TEXT NOT NULL,
  tipo_aeronave TEXT NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT,
  ordem INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cad_manobras_tipo ON cadastro_manobras(tipo_sessao, tipo_aeronave) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cad_manobras_ordem ON cadastro_manobras(ordem) WHERE deleted_at IS NULL;

-- Fichas do simulador
CREATE TABLE IF NOT EXISTS fichas_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  examinador_id INTEGER,
  data_sessao TEXT NOT NULL,
  tipo_sessao TEXT NOT NULL,
  tipo_aeronave TEXT,
  status TEXT NOT NULL DEFAULT 'EM_PREENCHIMENTO' CHECK(status IN ('EM_PREENCHIMENTO','ASSINADA_ALUNO','ASSINADA_INSTRUTOR','ASSINADA_EXAMINADOR','ASSINADA_TOTAL','CANCELADA')),
  nota_geral REAL,
  comentarios_gerais TEXT,
  assinatura_aluno TEXT,
  data_assinatura_aluno TEXT,
  ip_assinatura_aluno TEXT,
  assinatura_instrutor TEXT,
  data_assinatura_instrutor TEXT,
  ip_assinatura_instrutor TEXT,
  assinatura_examinador TEXT,
  data_assinatura_examinador TEXT,
  ip_assinatura_examinador TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_id) REFERENCES sessoes_simulador(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (examinador_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_fichas_sessao ON fichas_simulador(sessao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_funcionario ON fichas_simulador(funcionario_id) WHERE deleted_at IS NULL;

-- Manobras por ficha
CREATE TABLE IF NOT EXISTS fichas_simulador_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT,
  ordem INTEGER DEFAULT 0,
  resultado TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (ficha_id) REFERENCES fichas_simulador(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fichas_manobras_ficha ON fichas_simulador_manobras(ficha_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fichas_manobras_ordem ON fichas_simulador_manobras(ordem) WHERE deleted_at IS NULL;

-- Seeds mínimos
-- Simulador (se não existir)
INSERT INTO simuladores (modelo, fabricante, tipo, codigo)
SELECT 'A320', 'Airbus', 'FFN', 'SIM-A320-LOCAL'
WHERE NOT EXISTS (SELECT 1 FROM simuladores WHERE codigo = 'SIM-A320-LOCAL');

-- Funcionários básicos (se não existirem)
INSERT INTO funcionarios (matricula, nome, cpf, email, funcao, cargo, ativo)
SELECT 'MAT001', 'João Silva', '111.111.111-11', 'joao@airtrust.com', 'PILOTO', 'Piloto', 1
WHERE NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula = 'MAT001');

INSERT INTO funcionarios (matricula, nome, cpf, email, funcao, cargo, ativo)
SELECT 'MAT002', 'Maria Santos', '222.222.222-22', 'maria@airtrust.com', 'INSTRUTOR', 'Instrutor', 1
WHERE NOT EXISTS (SELECT 1 FROM funcionarios WHERE matricula = 'MAT002');

-- Sessão exemplo (hoje)
INSERT INTO sessoes_simulador (simulador_id, instrutor_id, checador_id, data_sessao, duracao_minutos, tipo_sessao, status)
SELECT s.id, (SELECT id FROM funcionarios WHERE matricula='MAT002'), NULL, datetime('now'), 90, 'TREINAMENTO', 'AGENDADA'
FROM simuladores s WHERE s.codigo='SIM-A320-LOCAL'
AND NOT EXISTS (SELECT 1 FROM sessoes_simulador WHERE DATE(data_sessao)=DATE('now'));

-- Manobras padrão para LPC A320
INSERT INTO cadastro_manobras (tipo_sessao, tipo_aeronave, codigo, descricao, categoria, ordem)
SELECT 'TREINAMENTO', 'A320', 'LPC-01', 'Low visibility takeoff', 'DECOLAGEM', 1
WHERE NOT EXISTS (SELECT 1 FROM cadastro_manobras WHERE tipo_sessao='TREINAMENTO' AND tipo_aeronave='A320' AND codigo='LPC-01');

INSERT INTO cadastro_manobras (tipo_sessao, tipo_aeronave, codigo, descricao, categoria, ordem)
SELECT 'TREINAMENTO', 'A320', 'LPC-02', 'Engine failure after V1', 'EMERGENCIA', 2
WHERE NOT EXISTS (SELECT 1 FROM cadastro_manobras WHERE tipo_sessao='TREINAMENTO' AND tipo_aeronave='A320' AND codigo='LPC-02');

INSERT INTO cadastro_manobras (tipo_sessao, tipo_aeronave, codigo, descricao, categoria, ordem)
SELECT 'TREINAMENTO', 'A320', 'LPC-03', 'Non-precision approach', 'APROXIMACAO', 3
WHERE NOT EXISTS (SELECT 1 FROM cadastro_manobras WHERE tipo_sessao='TREINAMENTO' AND tipo_aeronave='A320' AND codigo='LPC-03');

-- Diagnósticos
SELECT 'simuladores' AS table_name, COUNT(*) AS total FROM simuladores;
SELECT 'funcionarios' AS table_name, COUNT(*) AS total FROM funcionarios;
SELECT 'sessoes_simulador' AS table_name, COUNT(*) AS total FROM sessoes_simulador;
SELECT 'cadastro_manobras' AS table_name, COUNT(*) AS total FROM cadastro_manobras;
