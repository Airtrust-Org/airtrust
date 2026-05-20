-- Migration: 0161_multi_tenant_empresas
-- Description: Implementa sistema multi-tenant com isolamento por empresa
-- Date: 2025-12-07
-- IMPORTANTE: Executar backup antes! npx wrangler d1 export airtrust-db --remote

-- ============================================
-- 1. CRIAR TABELA EMPRESAS (MASTER)
-- ============================================
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  codigo TEXT UNIQUE NOT NULL,  -- Ex: 'airtrust', 'cliente1'
  logo_url TEXT,
  dominio TEXT,                 -- Para SSO futuro
  config TEXT,                  -- JSON com configurações
  plano TEXT DEFAULT 'basic',   -- basic, pro, enterprise
  max_funcionarios INTEGER DEFAULT 100,
  max_storage_mb INTEGER DEFAULT 1000,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- ============================================
-- 2. CRIAR TABELA USUARIOS_EMPRESAS (N:N)
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios_empresas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  empresa_id INTEGER NOT NULL,
  role TEXT DEFAULT 'viewer',   -- admin, manager, editor, viewer
  is_primary INTEGER DEFAULT 0, -- Empresa principal do usuário
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(usuario_id, empresa_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================
-- 3. CRIAR TABELA CONFIGURAÇÕES POR EMPRESA
-- ============================================
CREATE TABLE IF NOT EXISTS empresas_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL UNIQUE,
  dias_alerta_vencimento INTEGER DEFAULT 30,
  email_notificacoes TEXT,
  webhook_url TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  logo_relatorio TEXT,
  cores_tema TEXT,              -- JSON
  modulos_ativos TEXT,          -- JSON array: ["treinamento", "compliance"]
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- ============================================
-- 4. INSERIR EMPRESA PADRÃO (AIRTRUST)
-- ============================================
INSERT INTO empresas (nome, codigo, cnpj, plano, max_funcionarios, max_storage_mb)
VALUES ('AirTrust', 'airtrust', NULL, 'enterprise', 9999, 99999);

-- ============================================
-- 5. ADICIONAR empresa_id EM TODAS AS TABELAS
-- ============================================

-- 5.1 FUNCIONARIOS
ALTER TABLE funcionarios ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_deleted ON funcionarios(empresa_id, deleted_at);

-- 5.2 QUALIFICACOES_HISTORICO
ALTER TABLE qualificacoes_historico ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_qual_hist_empresa ON qualificacoes_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_qual_hist_empresa_func ON qualificacoes_historico(empresa_id, funcionario_id);

-- 5.3 CERTIFICACOES
ALTER TABLE certificacoes ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_certificacoes_empresa ON certificacoes(empresa_id);

-- 5.4 CERTIFICADOS
ALTER TABLE certificados ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_certificados_empresa ON certificados(empresa_id);

-- 5.5 FICHAS_SESSAO
ALTER TABLE fichas_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);

-- 5.6 PASTA_VIRTUAL
ALTER TABLE pasta_virtual ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_empresa ON pasta_virtual(empresa_id);

-- 5.7 ARQUIVOS
ALTER TABLE arquivos ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_arquivos_empresa ON arquivos(empresa_id);

-- 5.8 AERONAVES
ALTER TABLE aeronaves ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_aeronaves_empresa ON aeronaves(empresa_id);

-- 5.9 MODELOS_SESSAO
ALTER TABLE modelos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);

-- 5.10 TIPOS_SESSAO
ALTER TABLE tipos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_tipos_sessao_empresa ON tipos_sessao(empresa_id);

-- 5.11 IMPORTACOES_LOG
ALTER TABLE importacoes_log ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_importacoes_empresa ON importacoes_log(empresa_id);

-- 5.12 NOTIFICACOES
ALTER TABLE notificacoes ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_empresa ON notificacoes(empresa_id);

-- 5.13 AUDITORIA
ALTER TABLE auditoria ADD COLUMN empresa_id INTEGER DEFAULT 1 REFERENCES empresas(id);
CREATE INDEX IF NOT EXISTS idx_auditoria_empresa ON auditoria(empresa_id);

-- ============================================
-- 6. ATUALIZAR USUARIOS EXISTENTES
-- ============================================
-- Vincular todos os usuários existentes à empresa AirTrust
INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT id, 1, 'admin', 1 FROM usuarios WHERE NOT EXISTS (
  SELECT 1 FROM usuarios_empresas WHERE usuario_id = usuarios.id AND empresa_id = 1
);

-- ============================================
-- 7. CRIAR ÍNDICES COMPOSTOS PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_func_empresa_status ON funcionarios(empresa_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_qual_empresa_func_tipo ON qualificacoes_historico(empresa_id, funcionario_id, tipo_id);
CREATE INDEX IF NOT EXISTS idx_fichas_empresa_func ON fichas_sessao(empresa_id, funcionario_id);

-- ============================================
-- 8. TRIGGER PARA AUDITORIA MULTI-TENANT
-- ============================================
DROP TRIGGER IF EXISTS audit_empresa_change;
CREATE TRIGGER audit_empresa_change
AFTER UPDATE ON funcionarios
WHEN OLD.empresa_id != NEW.empresa_id
BEGIN
  INSERT INTO auditoria (
    tabela, registro_id, acao, dados_anteriores, dados_novos, 
    usuario_id, empresa_id, created_at
  )
  VALUES (
    'funcionarios', NEW.id, 'EMPRESA_CHANGE',
    json_object('empresa_id', OLD.empresa_id),
    json_object('empresa_id', NEW.empresa_id),
    NEW.updated_by, NEW.empresa_id, datetime('now')
  );
END;

-- ============================================
-- 9. ADICIONAR CONFIGURAÇÃO PADRÃO
-- ============================================
INSERT INTO empresas_config (empresa_id, dias_alerta_vencimento, timezone, modulos_ativos)
VALUES (1, 30, 'America/Sao_Paulo', '["treinamento","compliance","documentos","relatorios"]');
