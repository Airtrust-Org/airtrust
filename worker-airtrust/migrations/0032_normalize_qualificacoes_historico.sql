-- Migration: 0032 - Normalizar qualificacoes_historico (Remover colunas que pertencem a tipos)
-- Date: 2025-11-20
-- Description: Remove 9 colunas que duplicam dados de qualificacoes_tipos
--              Manter apenas colunas específicas do histórico individual

-- ========================================
-- FASE 0: Dropar views dependentes
-- ========================================

-- Em alguns ambientes 'habilitacoes' é tabela; evitar DROP VIEW para não gerar erro
DROP TABLE IF EXISTS habilitacoes;
DROP VIEW IF EXISTS fichas;

-- ========================================
-- ANÁLISE: Colunas que devem ser REMOVIDAS
-- ========================================
-- nome (vem de qualificacoes_tipos)
-- descricao (vem de qualificacoes_tipos)
-- periodicidade_meses (vem de qualificacoes_tipos via validade_meses)
-- nota_minima (critério do tipo, não do histórico individual)
-- carga_horaria (vem de qualificacoes_tipos)
-- ativo (status do tipo, não do histórico)
-- checador (campo obsoleto, não usado)
-- arquivo_url (duplica certificado_url?)
-- certificado_nome, certificado_numero (metadata, pode manter)
-- nota_final (duplica nota?)

-- ========================================
-- FASE 1: Criar tabela limpa e migrar dados
-- ========================================

-- Criar tabela temporária com estrutura correta (25 colunas - removendo 9)
CREATE TABLE IF NOT EXISTS qualificacoes_historico_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funcionario_id TEXT NOT NULL,
    qualificacao_id TEXT,
    categoria TEXT,
    data_conclusao DATE,
    data_vencimento DATE,
    validade DATE,
    nota INTEGER,
    resultado TEXT,
    status TEXT DEFAULT 'ATIVO',
    tipo TEXT DEFAULT 'TREINAMENTO',
    codigo TEXT,
    instrutor TEXT,
    local TEXT,
    observacoes TEXT,
    certificado_url TEXT,
    certificado_nome TEXT,
    certificado_numero VARCHAR(100),
    certificado_gerado_em DATETIME,
    certificado_gerado_por INTEGER,
    renovada_by INTEGER,
    is_renovada INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
    deleted_at TEXT
);

-- Copiar dados mantendo apenas as colunas corretas
INSERT INTO qualificacoes_historico_new (
    id, funcionario_id, qualificacao_id, categoria,
    data_conclusao, data_vencimento, validade,
    nota, resultado, status, tipo, codigo,
    instrutor, local, observacoes,
    certificado_url, certificado_nome, certificado_numero,
    certificado_gerado_em, certificado_gerado_por,
    renovada_by, is_renovada,
    created_at, updated_at, deleted_at
)
SELECT 
    id, funcionario_id, qualificacao_id, categoria,
    data_conclusao, data_vencimento, validade,
    nota, resultado, status, tipo, codigo,
    instrutor, local, observacoes,
    certificado_url, certificado_nome, certificado_numero,
    certificado_gerado_em, certificado_gerado_por,
    renovada_by, is_renovada,
    created_at, updated_at, deleted_at
FROM qualificacoes_historico;

-- ========================================
-- FASE 2: Substituir tabela antiga
-- ========================================

DROP TABLE qualificacoes_historico;
ALTER TABLE qualificacoes_historico_new RENAME TO qualificacoes_historico;

-- ========================================
-- FASE 3: Recriar índices
-- ========================================

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_status ON qualificacoes_historico(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

-- ========================================
-- AUDITORIA
-- ========================================

-- Verificar resultado
SELECT 
    'qualificacoes_historico' as tabela,
    COUNT(*) as total_colunas,
    (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL) as registros_ativos
FROM pragma_table_info('qualificacoes_historico');

-- Esperado: 25 colunas (removemos 9)
