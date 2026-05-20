-- ============================================================================
-- SINCRONIZAÇÃO COMPLETA DO BANCO DE PRODUÇÃO
-- Data: 2025-10-22
-- Objetivo: Criar TODAS as tabelas que o código usa mas não existem
-- ============================================================================

-- ============================================================================
-- 1. TABELAS DE BACKUP E AUDITORIA
-- ============================================================================

CREATE TABLE IF NOT EXISTS funcionarios_backup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funcionario_id INTEGER NOT NULL,
    operacao TEXT NOT NULL, -- 'SOFT_DELETE', 'UPDATE', 'CREATE'
    dados_antes TEXT, -- JSON
    user_id INTEGER,
    ip TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_backup_funcionario ON funcionarios_backup(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_funcionarios_backup_timestamp ON funcionarios_backup(timestamp);

CREATE TABLE IF NOT EXISTS auditoriaavancadav2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    acao TEXT NOT NULL,
    user_id INTEGER,
    detalhes TEXT, -- JSON
    ip TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_auditoriaavancadav2_acao ON auditoriaavancadav2(acao);
CREATE INDEX IF NOT EXISTS idx_auditoriaavancadav2_user ON auditoriaavancadav2(user_id);
CREATE INDEX IF NOT EXISTS idx_auditoriaavancadav2_timestamp ON auditoriaavancadav2(timestamp);

-- ============================================================================
-- 2. VERIFICAR E ADICIONAR COLUNAS FALTANTES
-- ============================================================================

-- Adicionar deleted_at em funcionarios se não existir
-- SQLite não tem ALTER TABLE ADD COLUMN IF NOT EXISTS, então fazemos um workaround
CREATE TABLE IF NOT EXISTS funcionarios_temp AS SELECT * FROM funcionarios LIMIT 0;

-- Se a tabela temp foi criada, significa que funcionarios existe
-- Agora vamos verificar se deleted_at existe
PRAGMA table_info(funcionarios);

-- Adicionar deleted_at se não existir (será executado manualmente se necessário)
-- ALTER TABLE funcionarios ADD COLUMN deleted_at TEXT DEFAULT NULL;

-- ============================================================================
-- 3. TABELAS AUXILIARES
-- ============================================================================

-- Tabela de checks (exames médicos, proficiência, etc)
CREATE TABLE IF NOT EXISTS checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funcionario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL, -- 'ASO', 'PROFICIENCIA', 'CMA', etc
    codigo TEXT,
    descricao TEXT,
    data_realizacao TEXT,
    data_validade TEXT,
    resultado TEXT, -- 'APTO', 'INAPTO', 'APTO_COM_RESTRICAO'
    observacoes TEXT,
    arquivo_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_checks_funcionario ON checks(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_checks_tipo ON checks(tipo);
CREATE INDEX IF NOT EXISTS idx_checks_validade ON checks(data_validade);
CREATE INDEX IF NOT EXISTS idx_checks_deleted ON checks(deleted_at);

-- Tabela de exames
CREATE TABLE IF NOT EXISTS exames (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    funcionario_id INTEGER NOT NULL,
    tipo TEXT NOT NULL, -- 'MEDICO', 'PSICOLOGICO', 'TOXICOLOGICO'
    codigo TEXT,
    descricao TEXT,
    data_realizacao TEXT,
    data_validade TEXT,
    resultado TEXT,
    observacoes TEXT,
    arquivo_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL,
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_exames_funcionario ON exames(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_exames_tipo ON exames(tipo);
CREATE INDEX IF NOT EXISTS idx_exames_validade ON exames(data_validade);
CREATE INDEX IF NOT EXISTS idx_exames_deleted ON exames(deleted_at);

-- ============================================================================
-- 4. TABELAS DE CATÁLOGO
-- ============================================================================

-- Catálogo de treinamentos
CREATE TABLE IF NOT EXISTS catalogo_treinamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT, -- 'INICIAL', 'RECORRENTE', 'ESPECIAL'
    carga_horaria INTEGER,
    validade_meses INTEGER,
    observacoes TEXT,
    ativo BOOLEAN DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalogo_treinamentos_codigo ON catalogo_treinamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_catalogo_treinamentos_categoria ON catalogo_treinamentos(categoria);
CREATE INDEX IF NOT EXISTS idx_catalogo_treinamentos_ativo ON catalogo_treinamentos(ativo);

-- ============================================================================
-- 5. TABELAS DE NOTIFICAÇÕES E ALERTAS
-- ============================================================================

CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL, -- 'VENCIMENTO', 'ALERTA', 'INFO'
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    funcionario_id INTEGER,
    lida BOOLEAN DEFAULT 0,
    data_envio TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_funcionario ON notificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON notificacoes(tipo);

CREATE TABLE IF NOT EXISTS alertas_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    funcionario_id INTEGER NOT NULL,
    qualificacao_id INTEGER,
    data_envio TEXT DEFAULT (datetime('now')),
    destinatario TEXT,
    status TEXT DEFAULT 'ENVIADO',
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
    FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes(id)
);

CREATE INDEX IF NOT EXISTS idx_alertas_funcionario ON alertas_enviados(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_alertas_qualificacao ON alertas_enviados(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_alertas_data ON alertas_enviados(data_envio);

-- ============================================================================
-- 6. TABELAS DE SISTEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL, -- 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
    message TEXT NOT NULL,
    details TEXT, -- JSON
    timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_timestamp ON system_logs(timestamp);

-- ============================================================================
-- 7. INSERIR DADOS PADRÃO
-- ============================================================================

-- Configurações do sistema
INSERT OR IGNORE INTO system_config (key, value, description) VALUES
('schema_version', '2.0', 'Versão do schema do banco de dados'),
('last_sync', datetime('now'), 'Última sincronização completa'),
('backup_enabled', '1', 'Backup automático habilitado'),
('audit_enabled', '1', 'Auditoria habilitada');

-- ============================================================================
-- FIM DA SINCRONIZAÇÃO
-- ============================================================================

SELECT 'Sincronização completa executada com sucesso!' as message;
SELECT COUNT(*) as total_tabelas FROM sqlite_master WHERE type='table';
