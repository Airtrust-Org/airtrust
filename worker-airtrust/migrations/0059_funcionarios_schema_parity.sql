-- NOVA ESTRATÉGIA: Recriação total preservando dados existentes (evita erros de coluna já criada)
-- Passos:
-- 1. Criar tabela provisória completa
-- 2. Copiar dados das colunas existentes
-- 3. Dropar tabela antiga
-- 4. Renomear tabela nova


PRAGMA foreign_keys=OFF;

-- Estratégia segura: renomeia tabela antiga, cria nova completa, copia dados, remove antiga.
ALTER TABLE funcionarios RENAME TO funcionarios_old;

CREATE TABLE funcionarios (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	nome TEXT NOT NULL,
	email TEXT UNIQUE,
	matricula TEXT UNIQUE,
	cpf TEXT,
	cargo TEXT,
	departamento TEXT,
	status TEXT DEFAULT 'ATIVO',
	observacoes TEXT,
	nome_guerra TEXT,
	funcao TEXT,
	setor TEXT,
	codigo_anac TEXT,
	is_instrutor INTEGER DEFAULT 0,
	is_checador INTEGER DEFAULT 0,
	ativo INTEGER DEFAULT 1,
	-- Campos adicionais de perfil
	rg TEXT,
	data_nascimento TEXT,
	sexo TEXT,
	nacionalidade TEXT,
	telefone_emergencia TEXT,
	contato_emergencia_nome TEXT,
	foto_url TEXT,
	base TEXT,
	aeronave TEXT,
	data_admissao TEXT,
	nivel_icao TEXT,
	validade_icao TEXT,
	cma TEXT,
	validade_cma TEXT,
	aso TEXT,
	validade_aso TEXT,
	sispat TEXT,
	prestserv TEXT,
	-- Endereço detalhado
	endereco TEXT,
	cep TEXT,
	logradouro TEXT,
	numero TEXT,
	complemento TEXT,
	bairro TEXT,
	cidade TEXT,
	estado TEXT,
	escala TEXT,
	-- Auditoria
	created_at TEXT DEFAULT (datetime('now')),
	updated_at TEXT DEFAULT (datetime('now')),
	deleted_at TEXT
);

INSERT INTO funcionarios (
	id, nome, email, matricula, cpf, cargo, departamento, status, observacoes, nome_guerra,
	funcao, setor, codigo_anac, is_instrutor, is_checador, ativo,
	rg, data_nascimento, sexo, nacionalidade, telefone_emergencia, contato_emergencia_nome, foto_url, base, aeronave, data_admissao,
	nivel_icao, validade_icao, cma, validade_cma, aso, validade_aso, sispat, prestserv, endereco, cep, logradouro, numero, complemento, bairro, cidade, estado, escala,
	created_at, updated_at, deleted_at
)
SELECT 
	id, nome, email, matricula, cpf, cargo, NULL as departamento, status, NULL as observacoes, nome_guerra,
	funcao, setor, codigo_anac, is_instrutor, is_checador, 1 as ativo,
	NULL as rg, NULL as data_nascimento, NULL as sexo, NULL as nacionalidade, NULL as telefone_emergencia, NULL as contato_emergencia_nome, NULL as foto_url, NULL as base, NULL as aeronave, NULL as data_admissao,
	NULL as nivel_icao, NULL as validade_icao, NULL as cma, NULL as validade_cma, NULL as aso, NULL as validade_aso, NULL as sispat, NULL as prestserv, endereco, NULL as cep, NULL as logradouro, NULL as numero, NULL as complemento, NULL as bairro, NULL as cidade, NULL as estado, escala,
	created_at, updated_at, deleted_at
FROM funcionarios_old;

DROP TABLE funcionarios_old;

PRAGMA foreign_keys=ON;
