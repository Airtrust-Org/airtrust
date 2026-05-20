-- Criação de tabelas lookup para Funções, Setores e Aeronaves
-- Essas tabelas permitem manter um conjunto organizado de opções para seleção nos formulários

-- Tabela de Funções/Cargos
CREATE TABLE IF NOT EXISTS funcoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela de Setores/Departamentos
CREATE TABLE IF NOT EXISTS setores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Tabela de Aeronaves
CREATE TABLE IF NOT EXISTS aeronaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo TEXT NOT NULL,
  prefixo TEXT UNIQUE,
  fabricante TEXT,
  ano_fabricacao INTEGER,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Inserir dados padrão de Funções (baseado em CARGOS do sistema)
INSERT OR IGNORE INTO funcoes (nome, descricao) VALUES
  ('Piloto', 'Piloto de aeronave'),
  ('Comissário', 'Comissário de bordo'),
  ('Mecânico', 'Mecânico de aeronave'),
  ('Instrutor', 'Instrutor de voo'),
  ('Examinador', 'Examinador de licenças'),
  ('Despachante', 'Despachante operacional'),
  ('Meteorologista', 'Meteorologista'),
  ('Engenheiro', 'Engenheiro de sistemas'),
  ('Técnico', 'Técnico de manutenção'),
  ('Administrativo', 'Administrativo'),
  ('Gerente', 'Gerente operacional'),
  ('Coordenador', 'Coordenador');

-- Inserir dados padrão de Setores
INSERT OR IGNORE INTO setores (nome, descricao) VALUES
  ('Operações', 'Setor de operações de voo'),
  ('Manutenção', 'Setor de manutenção'),
  ('Administrativo', 'Setor administrativo'),
  ('Recursos Humanos', 'Recursos Humanos'),
  ('Treinamento', 'Setor de treinamento'),
  ('Segurança', 'Setor de segurança operacional'),
  ('Planejamento', 'Setor de planejamento'),
  ('Qualidade', 'Setor de qualidade'),
  ('Financeiro', 'Setor financeiro'),
  ('TI', 'Setor de Tecnologia da Informação');

-- Inserir dados padrão de Aeronaves (exemplos comuns)
INSERT OR IGNORE INTO aeronaves (modelo, prefixo, fabricante, ano_fabricacao) VALUES
  ('Airbus A320', 'PT-MXA', 'Airbus', 2010),
  ('Boeing 737', 'PT-WOJ', 'Boeing', 2008),
  ('Embraer E170', 'PR-ZEE', 'Embraer', 2015),
  ('Beechcraft King Air', 'PT-MZO', 'Beechcraft', 2005),
  ('Cessna 208', 'PT-LCP', 'Cessna', 2012),
  ('ATR 72', 'PR-TJA', 'ATR', 2009),
  ('Bombardier CRJ', 'PR-CFB', 'Bombardier', 2007),
  ('Saab 340', 'PT-LFX', 'Saab', 2006);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_funcoes_ativo ON funcoes(ativo);
CREATE INDEX IF NOT EXISTS idx_setores_ativo ON setores(ativo);
CREATE INDEX IF NOT EXISTS idx_aeronaves_ativo ON aeronaves(ativo);
