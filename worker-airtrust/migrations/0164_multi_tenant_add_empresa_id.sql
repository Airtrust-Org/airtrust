-- Migration: 0164_multi_tenant_add_empresa_id
-- Description: Adiciona empresa_id nas tabelas de dados restantes
-- Date: 2025-12-07
-- NOTA: fichas_sessao já tem empresa_id, pular

-- ============================================
-- 1. CRIAR TABELAS AUXILIARES SE NÃO EXISTIREM
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
-- 2. ADICIONAR empresa_id NAS TABELAS QUE FALTAM
-- ============================================
ALTER TABLE funcionarios ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE qualificacoes_historico ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE pasta_virtual ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE arquivos ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE aeronaves ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE modelos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE tipos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;
ALTER TABLE importacoes_log ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 3. CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa_ativo ON funcionarios(empresa_id, ativo);
CREATE INDEX IF NOT EXISTS idx_qual_hist_empresa ON qualificacoes_historico(empresa_id);
CREATE INDEX IF NOT EXISTS idx_qual_hist_empresa_func ON qualificacoes_historico(empresa_id, funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_empresa ON fichas_sessao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pasta_virtual_empresa ON pasta_virtual(empresa_id);
CREATE INDEX IF NOT EXISTS idx_arquivos_empresa ON arquivos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_aeronaves_empresa ON aeronaves(empresa_id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_empresa ON modelos_sessao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tipos_sessao_empresa ON tipos_sessao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_importacoes_empresa ON importacoes_log(empresa_id);

-- ============================================
-- 4. VINCULAR USUARIOS EXISTENTES
-- ============================================
INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT id, 1, 'admin', 1 FROM usuarios;

-- ============================================
-- 5. CONFIGURAÇÃO PADRÃO
-- ============================================
INSERT OR IGNORE INTO empresas_config (empresa_id, dias_alerta_vencimento, timezone, modulos_ativos)
VALUES (1, 30, 'America/Sao_Paulo', '["treinamento","compliance","documentos","relatorios"]');
