-- Adicionar colunas faltantes em funcionarios
ALTER TABLE funcionarios ADD COLUMN guerra TEXT;
ALTER TABLE funcionarios ADD COLUMN codigo_anac TEXT;
ALTER TABLE funcionarios ADD COLUMN codigo_canac TEXT;
ALTER TABLE funcionarios ADD COLUMN funcao TEXT;
ALTER TABLE funcionarios ADD COLUMN base TEXT;
ALTER TABLE funcionarios ADD COLUMN contrato TEXT;
ALTER TABLE funcionarios ADD COLUMN licenca_aeronautica TEXT;
ALTER TABLE funcionarios ADD COLUMN anv TEXT;
ALTER TABLE funcionarios ADD COLUMN codigo_sispat TEXT;
ALTER TABLE funcionarios ADD COLUMN codigo_prestserv TEXT;
ALTER TABLE funcionarios ADD COLUMN cma_numero TEXT;
ALTER TABLE funcionarios ADD COLUMN cma_data_vencimento TEXT;
ALTER TABLE funcionarios ADD COLUMN cma_status TEXT;
ALTER TABLE funcionarios ADD COLUMN aso_data_vencimento TEXT;
ALTER TABLE funcionarios ADD COLUMN nivel_icao TEXT;
ALTER TABLE funcionarios ADD COLUMN nivel_icao_data_vencimento TEXT;
ALTER TABLE funcionarios ADD COLUMN nivel_icao_status TEXT;
ALTER TABLE funcionarios ADD COLUMN aeronave_principal TEXT;
ALTER TABLE funcionarios ADD COLUMN is_instrutor INTEGER DEFAULT 0;
ALTER TABLE funcionarios ADD COLUMN is_checador INTEGER DEFAULT 0;

-- Adicionar colunas faltantes em qualificacoes
ALTER TABLE qualificacoes ADD COLUMN is_superseded INTEGER DEFAULT 0;
ALTER TABLE qualificacoes ADD COLUMN descricao TEXT;
ALTER TABLE qualificacoes ADD COLUMN categoria TEXT;
ALTER TABLE qualificacoes ADD COLUMN periodicidade_meses INTEGER;
ALTER TABLE qualificacoes ADD COLUMN nota_minima REAL;
ALTER TABLE qualificacoes ADD COLUMN carga_horaria INTEGER;
ALTER TABLE qualificacoes ADD COLUMN ativo INTEGER DEFAULT 1;
ALTER TABLE qualificacoes ADD COLUMN data_conclusao TEXT;
ALTER TABLE qualificacoes ADD COLUMN data_vencimento TEXT;
ALTER TABLE qualificacoes ADD COLUMN nota_final REAL;
ALTER TABLE qualificacoes ADD COLUMN checador TEXT;
