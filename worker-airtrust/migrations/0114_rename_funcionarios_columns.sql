-- Migration 0114: Renomear colunas de funcionarios para match com Excel
-- Objetivo: Simplificar importação removendo underscores

-- Renomear colunas para ficarem iguais ao Excel
ALTER TABLE funcionarios RENAME COLUMN nome_guerra TO guerra;
ALTER TABLE funcionarios RENAME COLUMN data_nascimento TO nascimento;
ALTER TABLE funcionarios RENAME COLUMN data_admissao TO admissao_date;

-- Remover coluna duplicada antiga (se existir)
-- A coluna 'admissao' antiga será mantida mas renomeada para 'admissao_date'
-- para não conflitar com imports futuros que possam usar 'Admissao' do Excel
