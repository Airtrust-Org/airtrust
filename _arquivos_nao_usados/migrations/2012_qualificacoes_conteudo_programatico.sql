-- Migration 2012: Qualificações com Conteúdo Programático
-- Data: 2 de novembro de 2025
-- Objetivo: Adicionar conteudo_programatico + carga_horaria + empresas table

PRAGMA foreign_keys = OFF;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. ADICIONAR COLUNAS EM QUALIFICACOES
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE qualificacoes ADD COLUMN carga_horaria REAL DEFAULT 8.0;
ALTER TABLE qualificacoes ADD COLUMN empresa_id INTEGER;
ALTER TABLE qualificacoes ADD COLUMN conteudo_programatico TEXT;

CREATE INDEX IF NOT EXISTS idx_qual_carga_horaria ON qualificacoes(carga_horaria);
CREATE INDEX IF NOT EXISTS idx_qual_empresa ON qualificacoes(empresa_id);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CRIAR TABELA EMPRESAS
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  razao_social TEXT,
  cnpj TEXT UNIQUE,
  email TEXT,
  telefone TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_empresas_nome ON empresas(nome);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_deleted ON empresas(deleted_at);

PRAGMA foreign_keys = ON;

SELECT 'Migration 2012 - Conteúdo programático + empresas' as status;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. INSERIR TIPOS PADRÃO
-- ═══════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO tipos_qualificacoes (nome, descricao) VALUES 
('CMA', 'Certificado Médico Aeronáutico'),
('ICAO', 'Certificado ICAO - Padrões Internacionais'),
('ASO', 'Avaliação de Saúde Ocupacional');

-- ═══════════════════════════════════════════════════════════════════════
-- 5. VERIFICAR/ATUALIZAR TABELA EMPRESAS (já existe no schema base)
-- ═══════════════════════════════════════════════════════════════════════

-- Apenas certificar de que empresas tem os dados padrão
INSERT OR IGNORE INTO empresas (id, nome, cnpj) VALUES (1, 'COSTA DO SOL TÁXI AÉREO', '00.000.000/0000-00');

-- ═══════════════════════════════════════════════════════════════════════
-- 7. VALIDAÇÃO E RELATÓRIO
-- ═══════════════════════════════════════════════════════════════════════

SELECT 'Migration 2012 concluída com sucesso' as status;

SELECT 
  'TIPOS_QUALIFICACOES' as tabela,
  COUNT(*) as total
FROM tipos_qualificacoes
WHERE deleted_at IS NULL;

SELECT 
  'EMPRESAS' as tabela,
  COUNT(*) as total
FROM empresas
WHERE deleted_at IS NULL;

SELECT 
  'QUALIFICACOES atualadas' as metrica,
  COUNT(*) as total,
  COUNT(CASE WHEN carga_horaria > 0 THEN 1 END) as com_carga_horaria,
  COUNT(CASE WHEN conteudo_programatico IS NOT NULL THEN 1 END) as com_conteudo,
  COUNT(CASE WHEN empresa_id IS NOT NULL THEN 1 END) as com_empresa
FROM qualificacoes
WHERE deleted_at IS NULL;

SELECT 
  'Carga horária - Estatísticas' as validacao,
  MIN(carga_horaria) as minimo,
  MAX(carga_horaria) as maximo,
  ROUND(AVG(carga_horaria), 2) as media
FROM qualificacoes
WHERE carga_horaria > 0 AND deleted_at IS NULL;

PRAGMA foreign_keys = ON;
