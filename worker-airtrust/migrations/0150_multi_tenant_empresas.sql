-- =========================================
-- MIGRATION: MULTI-TENANT EMPRESAS
-- Adiciona empresa_id em TODAS as tabelas
-- Data: 2025-12-07
-- =========================================

PRAGMA foreign_keys = ON;

-- =========================================
-- TABELA CENTRAL: EMPRESAS
-- =========================================

CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Identificação
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT UNIQUE,
  
  -- Contato
  email_principal TEXT,
  telefone TEXT,
  endereco TEXT,
  
  -- Branding
  logo_url TEXT,
  cor_primaria TEXT DEFAULT '#1e40af',
  cor_secundaria TEXT DEFAULT '#3b82f6',
  
  -- Status
  ativo INTEGER DEFAULT 1,
  plano TEXT DEFAULT 'FREE' CHECK(plano IN ('FREE', 'PRO', 'ENTERPRISE')),
  data_expiracao TEXT,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  -- Auditoria
  criado_por INTEGER,
  atualizado_por INTEGER
);

CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON empresas(ativo, deleted_at);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj) WHERE deleted_at IS NULL;

-- =========================================
-- TABELA: USUÁRIOS ↔ EMPRESAS
-- =========================================

CREATE TABLE IF NOT EXISTS usuarios_empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  
  -- Role específico nesta empresa
  role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('SUPER_ADMIN', 'ADMIN', 'GESTOR', 'INSTRUTOR', 'USER')),
  
  -- Status
  ativo INTEGER DEFAULT 1,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  UNIQUE(usuario_id, empresa_id, deleted_at)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_usuario ON usuarios_empresas(usuario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresas_empresa ON usuarios_empresas(empresa_id, ativo, deleted_at);

-- =========================================
-- TABELA: CONFIGURAÇÕES POR EMPRESA
-- =========================================

CREATE TABLE IF NOT EXISTS empresas_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  
  -- Integração EdApp
  edapp_api_token TEXT,
  edapp_webhook_secret TEXT,
  edapp_webhook_id TEXT,
  edapp_ativo INTEGER DEFAULT 0,
  
  -- Certificados
  certificado_template_html TEXT,
  certificado_logo_url TEXT,
  certificado_assinatura_digital TEXT,
  
  -- SMTP próprio
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_password TEXT,
  smtp_from TEXT,
  
  -- Configurações gerais
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  idioma TEXT DEFAULT 'pt-BR',
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  UNIQUE(empresa_id)
);

-- =========================================
-- ADICIONAR empresa_id EM TABELAS EXISTENTES
-- =========================================

-- Funcionários
ALTER TABLE funcionarios ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id);

-- Qualificações
ALTER TABLE qualificacoes_historico ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_empresa ON qualificacoes_historico(empresa_id);

-- Certificações
ALTER TABLE certificacoes ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_certificacoes_empresa ON certificacoes(empresa_id);

-- Certificados
ALTER TABLE certificados ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON certificados(empresa_id);

-- Simuladores - Fichas
ALTER TABLE fichas_sessao ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_fichas_empresa ON fichas_sessao(empresa_id);

ALTER TABLE fichas_sessao_manobras ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_fichas_manobras_empresa ON fichas_sessao_manobras(empresa_id);

-- Histórico Notas Manobras
ALTER TABLE historico_notas_manobras ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_hist_notas_empresa ON historico_notas_manobras(empresa_id);

-- Alertas Reforço
ALTER TABLE alertas_reforco ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_alertas_empresa ON alertas_reforco(empresa_id);

-- Compliance
ALTER TABLE compliance ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_compliance_empresa ON compliance(empresa_id);

-- FRMS
ALTER TABLE frms_relatorios ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_frms_empresa ON frms_relatorios(empresa_id);

-- Hospedagem
ALTER TABLE hospedagem ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_hospedagem_empresa ON hospedagem(empresa_id);

-- Pasta Virtual
ALTER TABLE pasta_virtual ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_pasta_empresa ON pasta_virtual(empresa_id);

-- Auditoria Avançada
ALTER TABLE auditoriaavancadav2 ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoriaavancadav2(empresa_id);

-- Integrações EdApp
ALTER TABLE integracoes_edapp_usuarios ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_edapp_usuarios_empresa ON integracoes_edapp_usuarios(empresa_id);

ALTER TABLE integracoes_edapp_cursos ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_edapp_cursos_empresa ON integracoes_edapp_cursos(empresa_id);

ALTER TABLE integracoes_edapp_eventos ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_edapp_eventos_empresa ON integracoes_edapp_eventos(empresa_id);

ALTER TABLE integracoes_edapp_config ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_edapp_config_empresa ON integracoes_edapp_config(empresa_id);

-- Simuladores - Sessões
ALTER TABLE sessoes ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_sessoes_empresa ON sessoes(empresa_id);

-- Simuladores - Modelos
ALTER TABLE modelos_sessao ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);

-- Aeronaves
ALTER TABLE aeronaves ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_aeronaves_empresa ON aeronaves(empresa_id);

-- =========================================
-- TRIGGERS: updated_at automático
-- =========================================

CREATE TRIGGER IF NOT EXISTS trg_empresas_updated_at
AFTER UPDATE ON empresas FOR EACH ROW
BEGIN
  UPDATE empresas SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_usuarios_empresas_updated_at
AFTER UPDATE ON usuarios_empresas FOR EACH ROW
BEGIN
  UPDATE usuarios_empresas SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_empresas_config_updated_at
AFTER UPDATE ON empresas_config FOR EACH ROW
BEGIN
  UPDATE empresas_config SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- =========================================
-- DADOS INICIAIS: EMPRESA MASTER (ID 1)
-- =========================================

INSERT OR IGNORE INTO empresas (id, razao_social, nome_fantasia, cnpj, ativo, plano)
VALUES (1, 'AirTrust Master', 'AirTrust', '00.000.000/0001-00', 1, 'ENTERPRISE');

INSERT OR IGNORE INTO empresas_config (empresa_id)
VALUES (1);

-- =========================================
-- MIGRAÇÃO: ATRIBUIR empresa_id=1 aos dados existentes
-- =========================================

UPDATE funcionarios SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE qualificacoes_historico SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE certificacoes SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE certificados SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE fichas_sessao SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE fichas_sessao_manobras SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE historico_notas_manobras SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE alertas_reforco SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE compliance SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE pasta_virtual SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE auditoriaavancadav2 SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE integracoes_edapp_usuarios SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE integracoes_edapp_cursos SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE integracoes_edapp_eventos SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE sessoes SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE modelos_sessao SET empresa_id = 1 WHERE empresa_id IS NULL;
UPDATE aeronaves SET empresa_id = 1 WHERE empresa_id IS NULL;

PRAGMA foreign_key_check;
