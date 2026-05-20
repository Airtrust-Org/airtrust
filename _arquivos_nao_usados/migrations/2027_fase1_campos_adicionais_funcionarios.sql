-- Migration 2027: Adicionar campos faltantes para Fase 1 (Funcionários)
-- Data: 18 de novembro de 2025
-- Objetivo: Garantir que todos os campos da Fase 1 estejam presentes

-- Adicionar campos faltantes
ALTER TABLE funcionarios ADD COLUMN sexo TEXT;
ALTER TABLE funcionarios ADD COLUMN nacionalidade TEXT DEFAULT 'Brasileira';
ALTER TABLE funcionarios ADD COLUMN telefone_emergencia TEXT;
ALTER TABLE funcionarios ADD COLUMN contato_emergencia_nome TEXT;
ALTER TABLE funcionarios ADD COLUMN foto_url TEXT;

-- Criar alias para nome_completo (campo nome já existe)
-- Criar alias para uf (campo estado já existe)

-- Adicionar índices para novos campos
CREATE INDEX IF NOT EXISTS idx_funcionarios_sexo ON funcionarios(sexo);
CREATE INDEX IF NOT EXISTS idx_funcionarios_nacionalidade ON funcionarios(nacionalidade);

SELECT 'Migration 2027 - Campos da Fase 1 adicionados com sucesso' as status;
