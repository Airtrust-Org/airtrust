-- Migration: 0165_migrate_to_costa_do_sol
-- Description: Migrar dados da empresa AirTrust (1) para Costa do Sol (6)

-- 1.0 Preparação: Adicionar empresa_id em tabelas que não tinham (e que falharam anteriormente)
-- Adicionando em certificacoes (que NÃO tinha no output anterior)
-- ALTER TABLE certificacoes ADD COLUMN empresa_id INTEGER DEFAULT 1;
-- CREATE INDEX IF NOT EXISTS idx_certificacoes_empresa ON certificacoes(empresa_id);

-- Documentos e Qualificacoes Tipos
ALTER TABLE documentos ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_documentos_empresa ON documentos(empresa_id);

ALTER TABLE qualificacoes_tipos ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipos_empresa ON qualificacoes_tipos(empresa_id);

-- Tabelas que faltaram em migrations anteriores
ALTER TABLE setores ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_setores_empresa ON setores(empresa_id);

ALTER TABLE funcoes ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_funcoes_empresa ON funcoes(empresa_id);

ALTER TABLE modelos_aeronave ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_empresa ON modelos_aeronave(empresa_id);


-- 1. Migrar Funcionários
UPDATE funcionarios SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- 2. Migrar Setores, Funções, Aeronaves
UPDATE setores SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE funcoes SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE aeronaves SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE modelos_aeronave SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- 3. Migrar Dados de Treinamento e Qualificações
UPDATE qualificacoes_historico SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE qualificacoes_tipos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
-- UPDATE certificacoes SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
-- removendo certificados por enquanto para garantir que roda
-- UPDATE certificados SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE documentos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- 4. Migrar Simuladores
UPDATE fichas_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE modelos_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE tipos_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- 5. Migrar Arquivos em Geral
UPDATE pasta_virtual SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE arquivos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- 6. Atualizar Vínculo de Usuários
INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT usuario_id, 6, 'admin', 1
FROM usuarios_empresas
WHERE empresa_id = 1
AND NOT EXISTS (
    SELECT 1 FROM usuarios_empresas ue2 WHERE ue2.usuario_id = usuarios_empresas.usuario_id AND ue2.empresa_id = 6
);
