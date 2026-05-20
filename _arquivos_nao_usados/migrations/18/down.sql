
-- Remover campos adicionados da planilha
ALTER TABLE funcionarios DROP COLUMN data_admissao;
ALTER TABLE funcionarios DROP COLUMN codigo_prestserv;
ALTER TABLE funcionarios DROP COLUMN codigo_sispat;
ALTER TABLE funcionarios DROP COLUMN codigo_canac;
ALTER TABLE funcionarios DROP COLUMN licenca_aeronautica;
ALTER TABLE funcionarios DROP COLUMN data_nascimento;
ALTER TABLE funcionarios DROP COLUMN anv;

-- Remover índice criado
DROP INDEX IF EXISTS idx_funcionarios_matricula;
