-- =========================================
-- MIGRATION: Adicionar empresa_id em tabelas faltantes
-- Data: 2025-12-07
-- Descrição: Adiciona empresa_id apenas em tabelas que não têm
-- =========================================

PRAGMA foreign_keys = ON;

-- Verificar e adicionar empresa_id em tabelas principais
-- Nota: Ignorar erros se coluna já existir

-- Qualificações
ALTER TABLE qualificacoes_historico ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_empresa ON qualificacoes_historico(empresa_id);

-- Certificações
ALTER TABLE certificacoes ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_certificacoes_empresa ON certificacoes(empresa_id);

-- Certificados
ALTER TABLE certificados ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON certificados(empresa_id);

-- Sessões
ALTER TABLE sessoes ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_sessoes_empresa ON sessoes(empresa_id);

-- Modelos de Sessão
ALTER TABLE modelos_sessao ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);

-- Aeronaves
ALTER TABLE aeronaves ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_aeronaves_empresa ON aeronaves(empresa_id);

-- Simuladores
ALTER TABLE simuladores ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_simuladores_empresa ON simuladores(empresa_id);

-- Licenças
ALTER TABLE licencas ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_licencas_empresa ON licencas(empresa_id);

-- Pasta Virtual
ALTER TABLE pasta_virtual ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_pasta_empresa ON pasta_virtual(empresa_id);

-- Compliance
ALTER TABLE compliance ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_compliance_empresa ON compliance(empresa_id);

-- Auditoria
ALTER TABLE auditoriaavancadav2 ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoriaavancadav2(empresa_id);

-- =========================================
-- ATUALIZAR dados existentes para empresa_id = 1
-- =========================================

UPDATE funcionarios SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE qualificacoes_historico SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE certificacoes SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE certificados SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE sessoes SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE modelos_sessao SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE aeronaves SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE simuladores SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE licencas SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE pasta_virtual SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE compliance SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE auditoriaavancadav2 SET empresa_id = 1 WHERE empresa_id IS NULL;

PRAGMA foreign_key_check;
