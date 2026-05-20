-- Migration: 0130_remover_coluna_canac
-- Description: Remove coluna canac obsoleta (dados já migrados para codigo_anac)
-- Date: 2025-11-29

-- SQLite não suporta ALTER TABLE DROP COLUMN diretamente
-- Precisamos recriar a tabela sem a coluna canac

-- Dropar views que dependem de funcionarios
DROP VIEW IF EXISTS qualificacoes_historico_v;

-- Criar tabela temporária sem canac (schema baseado no PRAGMA atual)
CREATE TABLE IF NOT EXISTS funcionarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT,
  matricula TEXT,
  cpf TEXT,
  cargo TEXT,
  departamento TEXT,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  guerra TEXT,
  funcao TEXT,
  setor TEXT,
  codigo_anac TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  rg TEXT,
  nascimento TEXT,
  sexo TEXT,
  nacionalidade TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,
  foto_url TEXT,
  base TEXT,
  aeronave TEXT,
  nivel_icao TEXT,
  validade_icao TEXT,
  cma TEXT,
  validade_cma TEXT,
  aso TEXT,
  validade_aso TEXT,
  sispat TEXT,
  prestserv TEXT,
  endereco TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  escala TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  telefone TEXT,
  licenca TEXT,
  admissao TEXT,
  modelo_aeronave_id TEXT
);

-- Copiar TODOS os dados exceto coluna canac
INSERT INTO funcionarios_new SELECT 
  id, nome, email, matricula, cpf, cargo, departamento, status, observacoes,
  guerra, funcao, setor, codigo_anac, is_instrutor, is_checador, ativo,
  rg, nascimento, sexo, nacionalidade, telefone_emergencia, contato_emergencia_nome,
  foto_url, base, aeronave, nivel_icao, validade_icao, cma, validade_cma,
  aso, validade_aso, sispat, prestserv, endereco, cep, logradouro,
  numero, complemento, bairro, cidade, estado, escala, created_at, updated_at,
  deleted_at, telefone, licenca, admissao, modelo_aeronave_id
FROM funcionarios;

-- Remover tabela antiga
DROP TABLE funcionarios;

-- Renomear tabela nova
ALTER TABLE funcionarios_new RENAME TO funcionarios;

-- Recriar índices (se existirem)
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcionarios_codigo_anac ON funcionarios(codigo_anac);

-- Recriar VIEW qualificacoes_historico_v
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.data_conclusao,
  qh.data_vencimento,
  f.nome AS funcionario_nome,
  f.cpf AS funcionario_cpf,
  qt.codigo AS qualificacao_codigo,
  qt.nome AS qualificacao_nome,
  qt.categoria AS qualificacao_categoria
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
