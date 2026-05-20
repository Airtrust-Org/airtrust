-- Migration: 0162_multi_tenant_adapt
-- Description: Adapta tabela empresas existente para multi-tenant
-- Date: 2025-12-07
-- NOTA: A tabela empresas já existe com schema de certificados

-- ============================================
-- 1. ADICIONAR COLUNAS FALTANTES NA EMPRESAS
-- ============================================
ALTER TABLE empresas ADD COLUMN codigo TEXT;
ALTER TABLE empresas ADD COLUMN dominio TEXT;
ALTER TABLE empresas ADD COLUMN config TEXT;
ALTER TABLE empresas ADD COLUMN plano TEXT DEFAULT 'basic';
ALTER TABLE empresas ADD COLUMN max_funcionarios INTEGER DEFAULT 100;
ALTER TABLE empresas ADD COLUMN max_storage_mb INTEGER DEFAULT 1000;

-- Setar código para empresa existente (AirTrust)
UPDATE empresas SET codigo = 'airtrust', plano = 'enterprise', max_funcionarios = 9999, max_storage_mb = 99999 WHERE id = 1;

-- Criar índice único após ter dados
CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_codigo ON empresas(codigo);

-- ============================================
-- 2. CRIAR TABELA USUARIOS_EMPRESAS (N:N)
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios_empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'viewer',
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================
-- 3. CRIAR TABELA EMPRESAS_CONFIG (CONFIGURAÇÕES MULTI-TENANT)
-- ============================================
CREATE TABLE IF NOT EXISTS empresas_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  dias_alerta_vencimento INTEGER DEFAULT 30,
  email_notificacoes TEXT,
  webhook_url TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  logo_relatorio TEXT,
  cores_tema TEXT,
  modulos_ativos TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================
-- 4. ADICIONAR empresa_id EM TODAS AS TABELAS DE DADOS
-- ============================================

-- 4.1 FUNCIONARIOS
ALTER TABLE funcionarios ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_deleted ON funcionarios(empresa_id, deleted_at);

-- 4.2 QUALIFICACOES_HISTORICO
ALTER TABLE qualificacoes_historico ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_qual_hist_empresa ON qualificacoes_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_qual_hist_empresa_func ON qualificacoes_historico(empresa_id, funcionario_id);

-- 4.3 CERTIFICACOES (se existir)
-- ALTER TABLE certificacoes ADD COLUMN empresa_id INTEGER DEFAULT 1;
-- CREATE INDEX IF NOT EXISTS idx_certificacoes_empresa ON certificacoes(empresa_id);

-- 4.4 CERTIFICADOS (se existir)
-- ALTER TABLE certificados ADD COLUMN empresa_id INTEGER DEFAULT 1;
-- CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON certificados(empresa_id);

-- 4.5 FICHAS_SESSAO
ALTER TABLE fichas_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);

-- 4.6 PASTA_VIRTUAL
ALTER TABLE pasta_virtual ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_empresa ON pasta_virtual(empresa_id);

-- 4.7 ARQUIVOS
ALTER TABLE arquivos ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_arquivos_empresa ON arquivos(empresa_id);

-- 4.8 AERONAVES
ALTER TABLE aeronaves ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_aeronaves_empresa ON aeronaves(empresa_id);

-- 4.9 MODELOS_SESSAO
ALTER TABLE modelos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);

-- 4.10 TIPOS_SESSAO
ALTER TABLE tipos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_tipos_sessao_empresa ON tipos_sessao(empresa_id);

-- 4.11 IMPORTACOES_LOG
ALTER TABLE importacoes_log ADD COLUMN empresa_id INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_importacoes_empresa ON importacoes_log(empresa_id);

-- 4.12 NOTIFICACOES (se existir)
-- ALTER TABLE notificacoes ADD COLUMN empresa_id INTEGER DEFAULT 1;
-- CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa ON notificacoes(empresa_id);

-- 4.13 AUDITORIA (se existir)
-- ALTER TABLE auditoria ADD COLUMN empresa_id INTEGER DEFAULT 1;
-- CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);

-- ============================================
-- 5. VINCULAR USUARIOS EXISTENTES
-- ============================================
INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT id, 1, 'admin', 1 FROM usuarios;

-- ============================================
-- 6. CONFIGURAÇÃO PADRÃO
-- ============================================
INSERT OR IGNORE INTO empresas_config (empresa_id, dias_alerta_vencimento, timezone, modulos_ativos)
VALUES (1, 30, 'America/Sao_Paulo', '["treinamento","compliance","documentos","relatorios"]');

-- ============================================
-- 7. ÍNDICES COMPOSTOS PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_func_empresa_status ON funcionarios(empresa_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_qual_empresa_func_tipo ON qualificacoes_historico(empresa_id, funcionario_id, tipo_id);
CREATE INDEX IF NOT EXISTS idx_fichas_empresa_func ON fichas_sessao(empresa_id, funcionario_id);
