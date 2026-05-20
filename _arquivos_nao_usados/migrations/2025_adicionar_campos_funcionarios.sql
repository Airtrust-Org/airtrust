-- Migration 2025: Adicionar Campos Completos à Tabela Funcionarios
-- Data: 17 de novembro de 2025
-- Objetivo: Adicionar campos RG, Base, Endereço completo e Observações
-- Nota: Apenas colunas que NÃO existem ainda (verificado via PRAGMA table_info)

-- ============================================================
-- COLUNAS EXISTENTES (não adicionar):
-- id, matricula, nome, cpf, email, funcao, endereco, telefone, 
-- escala, status, is_instrutor, is_checador, created_at, 
-- updated_at, deleted_at, codigo_anac, cargo, setor
-- ============================================================

-- ============================================================
-- ADICIONAR APENAS COLUNAS FALTANTES
-- ============================================================

-- Dados Pessoais (NOVAS)
ALTER TABLE funcionarios ADD COLUMN rg TEXT;
ALTER TABLE funcionarios ADD COLUMN nome_guerra TEXT;
ALTER TABLE funcionarios ADD COLUMN data_nascimento TEXT;

-- Dados Profissionais (NOVAS)
ALTER TABLE funcionarios ADD COLUMN base TEXT;
ALTER TABLE funcionarios ADD COLUMN data_admissao TEXT;

-- Endereço Completo (NOVAS - logradouro será migrado do campo 'endereco')
ALTER TABLE funcionarios ADD COLUMN cep TEXT;
ALTER TABLE funcionarios ADD COLUMN logradouro TEXT;
ALTER TABLE funcionarios ADD COLUMN numero TEXT;
ALTER TABLE funcionarios ADD COLUMN complemento TEXT;
ALTER TABLE funcionarios ADD COLUMN bairro TEXT;
ALTER TABLE funcionarios ADD COLUMN cidade TEXT;
ALTER TABLE funcionarios ADD COLUMN estado TEXT;

-- Observações (NOVA)
ALTER TABLE funcionarios ADD COLUMN observacoes TEXT;

-- Campos de Qualificação/Documentação (NOVAS)
ALTER TABLE funcionarios ADD COLUMN aeronave TEXT;
ALTER TABLE funcionarios ADD COLUMN nivel_icao TEXT;
ALTER TABLE funcionarios ADD COLUMN validade_icao TEXT;
ALTER TABLE funcionarios ADD COLUMN cma TEXT;
ALTER TABLE funcionarios ADD COLUMN validade_cma TEXT;
ALTER TABLE funcionarios ADD COLUMN aso TEXT;
ALTER TABLE funcionarios ADD COLUMN validade_aso TEXT;
ALTER TABLE funcionarios ADD COLUMN sispat TEXT;
ALTER TABLE funcionarios ADD COLUMN prestserv TEXT;

-- ============================================================
-- MIGRAÇÃO DE DADOS: Endereco → Logradouro
-- ============================================================

-- Copiar dados do campo antigo 'endereco' para 'logradouro'
UPDATE funcionarios 
SET logradouro = endereco 
WHERE endereco IS NOT NULL 
  AND endereco != '';

-- ============================================================
-- CRIAR ÍNDICES PARA NOVOS CAMPOS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_funcionarios_base ON funcionarios(base);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cep ON funcionarios(cep);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cidade ON funcionarios(cidade);
CREATE INDEX IF NOT EXISTS idx_funcionarios_estado ON funcionarios(estado);
CREATE INDEX IF NOT EXISTS idx_funcionarios_aeronave ON funcionarios(aeronave);
CREATE INDEX IF NOT EXISTS idx_funcionarios_data_admissao ON funcionarios(data_admissao);

SELECT 'Migration 2025 - 22 campos adicionados com sucesso!' as status;
