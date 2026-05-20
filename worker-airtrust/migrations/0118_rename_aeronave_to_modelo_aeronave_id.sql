-- Migration: Rename aeronave to modelo_aeronave_id in funcionarios
-- Created: 2025-11-26
-- Description: Renomeia coluna aeronave para modelo_aeronave_id (vincula a modelos, não aeronaves físicas)

-- ATENÇÃO: SQLite não suporta ALTER COLUMN RENAME diretamente
-- Estratégia: criar nova coluna, copiar dados, remover antiga

-- 1. Adicionar nova coluna modelo_aeronave_id (temporariamente como TEXT para manter dados)
ALTER TABLE funcionarios ADD COLUMN modelo_aeronave_id_temp TEXT;

-- 2. Copiar dados da coluna antiga para a nova
UPDATE funcionarios SET modelo_aeronave_id_temp = aeronave;

-- 3. Remover coluna antiga (SQLite vai recriar a tabela internamente)
-- Nota: Vamos fazer isso em uma única operação para evitar problemas

-- Criar tabela temporária com nova estrutura
CREATE TABLE IF NOT EXISTS funcionarios_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula TEXT UNIQUE,
    nome TEXT NOT NULL,
    cpf TEXT UNIQUE,
    data_nascimento TEXT,
    telefone TEXT,
    email TEXT,
    cep TEXT,
    rua TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    uf TEXT,
    data_admissao TEXT,
    data_demissao TEXT,
    status TEXT DEFAULT 'ATIVO',
    observacoes TEXT,
    funcao_id INTEGER,
    setor_id INTEGER,
    modelo_aeronave_id TEXT,  -- Nova coluna (TEXT temporário para manter códigos existentes)
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME,
    FOREIGN KEY (funcao_id) REFERENCES funcoes(id),
    FOREIGN KEY (setor_id) REFERENCES setores(id)
);

-- Copiar todos os dados
INSERT INTO funcionarios_new 
SELECT 
    id, matricula, nome, cpf, data_nascimento, telefone, email,
    cep, rua, numero, complemento, bairro, cidade, uf,
    data_admissao, data_demissao, status, observacoes,
    funcao_id, setor_id, 
    aeronave as modelo_aeronave_id,  -- Renomeando aqui
    ativo, created_at, updated_at, deleted_at
FROM funcionarios;

-- Drop tabela antiga
DROP TABLE funcionarios;

-- Renomear nova tabela
ALTER TABLE funcionarios_new RENAME TO funcionarios;

-- Recriar índices
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf);
CREATE INDEX IF NOT EXISTS idx_funcionarios_nome ON funcionarios(nome);
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status);
CREATE INDEX IF NOT EXISTS idx_funcionarios_funcao ON funcionarios(funcao_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_setor ON funcionarios(setor_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave ON funcionarios(modelo_aeronave_id);

-- Nota: modelo_aeronave_id está como TEXT para manter dados existentes (AW139, SK76)
-- Em uma migration futura, podemos converter para INTEGER e vincular à tabela modelos_aeronave
