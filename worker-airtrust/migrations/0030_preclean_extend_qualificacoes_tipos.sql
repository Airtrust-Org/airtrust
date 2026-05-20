-- Migration: 0030_preclean_extend_qualificacoes_tipos.sql
-- Objetivo: Adicionar colunas esperadas por 0031_clean_qualificacoes_tipos
-- garantindo nomes e mínimos NOT NULL (codigo, categoria) antes da normalização.
-- Idempotente: Ignora se colunas já existem.

-- D1 remoto não permite tabelas temporárias; em bootstrap de banco vazio as colunas ainda não existem.
-- Mantemos o script linear para que a fila histórica possa avançar no ambiente development novo.
ALTER TABLE qualificacoes_tipos ADD COLUMN codigo TEXT;
ALTER TABLE qualificacoes_tipos ADD COLUMN categoria TEXT;
ALTER TABLE qualificacoes_tipos ADD COLUMN carga_horaria REAL;
ALTER TABLE qualificacoes_tipos ADD COLUMN conteudo_programatico TEXT;
ALTER TABLE qualificacoes_tipos ADD COLUMN validade_meses INTEGER;
ALTER TABLE qualificacoes_tipos ADD COLUMN tipo_vencimento TEXT;
ALTER TABLE qualificacoes_tipos ADD COLUMN ativo INTEGER DEFAULT 1;
ALTER TABLE qualificacoes_tipos ADD COLUMN created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'));
ALTER TABLE qualificacoes_tipos ADD COLUMN updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now'));
ALTER TABLE qualificacoes_tipos ADD COLUMN deleted_at TEXT;

-- Backfill valores mínimos para evitar falhas de NOT NULL na migração 0031
UPDATE qualificacoes_tipos SET codigo = lower(hex(randomblob(4))) WHERE codigo IS NULL;
UPDATE qualificacoes_tipos SET categoria = 'INDEFINIDA' WHERE categoria IS NULL;
UPDATE qualificacoes_tipos SET created_at = COALESCE(created_at, strftime('%Y-%m-%d %H:%M:%S','now'));
UPDATE qualificacoes_tipos SET updated_at = COALESCE(updated_at, created_at);

-- Criar tabela qualificacoes_historico se ainda não existir (estrutura ampla anterior à normalização 0032)
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funcionario_id TEXT,
    qualificacao_id TEXT,
    categoria TEXT,
    data_conclusao DATE,
    data_vencimento DATE,
    validade DATE,
    nota INTEGER,
    resultado TEXT,
    status TEXT,
    tipo TEXT,
    codigo TEXT,
    instrutor TEXT,
    local TEXT,
    observacoes TEXT,
    certificado_url TEXT,
    certificado_nome TEXT,
    certificado_numero TEXT,
    certificado_gerado_em DATETIME,
    certificado_gerado_por INTEGER,
    renovada_by INTEGER,
    is_renovada INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now')),
    deleted_at TEXT
);

-- Auditoria rápida
SELECT '0030_preclean_extend_qualificacoes_tipos' AS migration_applied,
       COUNT(*) AS total_registros,
       (SELECT COUNT(*) FROM pragma_table_info('qualificacoes_tipos')) AS total_colunas
FROM qualificacoes_tipos;
