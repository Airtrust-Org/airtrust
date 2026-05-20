-- Migration: 0031 - Limpar qualificacoes_tipos (Remover colunas que pertencem a historico)
-- Date: 2025-11-20
-- Description: Remove 11 colunas extras que não deveriam estar em qualificacoes_tipos
--              Essas colunas pertencem a qualificacoes_historico ou são duplicatas

-- ========================================
-- FASE 0: Dropar views dependentes
-- ========================================

DROP VIEW IF EXISTS v_qualificacoes_tipos_faltantes;
DROP VIEW IF EXISTS v_historico_faltante;
DROP VIEW IF EXISTS v_funcionarios_faltantes;

-- ========================================
-- FASE 1: Criar tabela limpa e migrar dados
-- ========================================

-- Criar tabela temporária com estrutura correta (apenas 13 colunas)
CREATE TABLE IF NOT EXISTS qualificacoes_tipos_new (
    id TEXT PRIMARY KEY DEFAULT (lower(
        hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || 
        substr(hex(randomblob(2)),2) || '-' || 
        substr('89ab',abs(random()) % 4 + 1, 1) || 
        substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))
    )),
    nome TEXT NOT NULL,
    descricao TEXT,
    codigo TEXT NOT NULL,
    categoria TEXT NOT NULL,
    carga_horaria REAL,
    conteudo_programatico TEXT,
    validade_meses INTEGER,
    tipo_vencimento TEXT,
    ativo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
    deleted_at TEXT
);

-- Copiar dados mantendo apenas as colunas corretas
INSERT INTO qualificacoes_tipos_new (
    id, nome, descricao, codigo, categoria, carga_horaria, 
    conteudo_programatico, validade_meses, tipo_vencimento, 
    ativo, created_at, updated_at, deleted_at
)
SELECT 
    id, nome, descricao, codigo, categoria, carga_horaria,
    conteudo_programatico, validade_meses, tipo_vencimento,
    ativo, created_at, updated_at, deleted_at
FROM qualificacoes_tipos;

-- ========================================
-- FASE 2: Substituir tabela antiga
-- ========================================

DROP TABLE qualificacoes_tipos;
ALTER TABLE qualificacoes_tipos_new RENAME TO qualificacoes_tipos;

-- ========================================
-- FASE 3: Recriar índices
-- ========================================

CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_ativo ON qualificacoes_tipos(ativo) WHERE deleted_at IS NULL;

-- ========================================
-- AUDITORIA
-- ========================================

-- Verificar resultado
SELECT 
    'qualificacoes_tipos' as tabela,
    COUNT(*) as total_colunas,
    (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL) as registros_ativos
FROM pragma_table_info('qualificacoes_tipos');

-- Esperado: 13 colunas
