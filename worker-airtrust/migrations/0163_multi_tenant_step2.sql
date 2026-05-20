-- Migration: 0163_multi_tenant_step2
-- Description: Adiciona empresa_id nas tabelas de dados (continuação)
-- Date: 2025-12-07
-- NOTA: Esta é a PARTE 2 após empresas já ter sido modificada

-- ============================================
-- 1. VERIFICAR SE usuarios_empresas EXISTE E CRIAR SE NÃO
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
-- 2. VERIFICAR SE empresas_config EXISTE E CRIAR SE NÃO
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
-- 3. ADICIONAR empresa_id EM FUNCIONARIOS
-- ============================================
ALTER TABLE funcionarios ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 4. ADICIONAR empresa_id EM QUALIFICACOES_HISTORICO
-- ============================================
ALTER TABLE qualificacoes_historico ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 5. ADICIONAR empresa_id EM FICHAS_SESSAO
-- ============================================
ALTER TABLE fichas_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 6. ADICIONAR empresa_id EM PASTA_VIRTUAL
-- ============================================
ALTER TABLE pasta_virtual ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 7. ADICIONAR empresa_id EM ARQUIVOS
-- ============================================
ALTER TABLE arquivos ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 8. ADICIONAR empresa_id EM AERONAVES
-- ============================================
ALTER TABLE aeronaves ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 9. ADICIONAR empresa_id EM MODELOS_SESSAO
-- ============================================
ALTER TABLE modelos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 10. ADICIONAR empresa_id EM TIPOS_SESSAO
-- ============================================
ALTER TABLE tipos_sessao ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 11. ADICIONAR empresa_id EM IMPORTACOES_LOG
-- ============================================
ALTER TABLE importacoes_log ADD COLUMN empresa_id INTEGER DEFAULT 1;

-- ============================================
-- 12. VINCULAR USUARIOS EXISTENTES
-- ============================================
INSERT OR IGNORE INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT id, 1, 'admin', 1 FROM usuarios;

-- ============================================
-- 13. CONFIGURAÇÃO PADRÃO
-- ============================================
INSERT OR IGNORE INTO empresas_config (empresa_id, dias_alerta_vencimento, timezone, modulos_ativos)
VALUES (1, 30, 'America/Sao_Paulo', '["treinamento","compliance","documentos","relatorios"]');
