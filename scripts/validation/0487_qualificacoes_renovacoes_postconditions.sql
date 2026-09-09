-- POST-CONDITION 0487: qualificacoes_renovacoes
-- Validacao estrutural read-only apos aplicacao.

-- 1. Verificar existencia da tabela
SELECT name FROM sqlite_master WHERE type='table' AND name='qualificacoes_renovacoes';

-- 2. Verificar colunas e FKs (PRAGMA nao pode ser usado aqui se for via D1, entao usando schema_master)
SELECT sql FROM sqlite_master WHERE type='table' AND name='qualificacoes_renovacoes';

-- 3. Verificar indices
SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='qualificacoes_renovacoes';
