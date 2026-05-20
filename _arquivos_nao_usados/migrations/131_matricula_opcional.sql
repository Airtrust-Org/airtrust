-- ========================================
-- Migration: 131_matricula_opcional.sql
-- Descrição: Torna a coluna matricula OPCIONAL na tabela funcionarios
-- Data: 2025-11-28
-- ========================================

-- SQLite não suporta ALTER COLUMN diretamente
-- Precisamos recriar a tabela sem o NOT NULL

-- 1. Criar nova tabela temporária sem NOT NULL em matricula
CREATE TABLE funcionarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula TEXT UNIQUE,  -- Removido NOT NULL
  nome TEXT NOT NULL,
  guerra TEXT,
  cpf TEXT UNIQUE NOT NULL,
  rg TEXT,
  nascimento TEXT,
  sexo TEXT,
  nacionalidade TEXT,
  email TEXT,
  telefone TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,
  funcao TEXT,
  cargo TEXT,
  setor TEXT,
  base TEXT,
  modelo_aeronave_id INTEGER,
  admissao TEXT,
  codigo_anac TEXT,
  nivel_icao TEXT,
  validade_icao TEXT,
  cma TEXT,
  validade_cma TEXT,
  aso TEXT,
  validade_aso TEXT,
  sispat TEXT,
  prestserv TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  observacoes TEXT,
  foto_url TEXT,
  status TEXT DEFAULT 'ATIVO',
  ativo INTEGER DEFAULT 1,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (modelo_aeronave_id) REFERENCES modelos_aeronave(id)
);

-- 2. Copiar todos os dados
INSERT INTO funcionarios_new SELECT * FROM funcionarios;

-- 3. Dropar tabela antiga
DROP TABLE funcionarios;

-- 4. Renomear nova tabela
ALTER TABLE funcionarios_new RENAME TO funcionarios;

-- 5. Recriar índices
CREATE INDEX idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_status ON funcionarios(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_deleted_at ON funcionarios(deleted_at);
