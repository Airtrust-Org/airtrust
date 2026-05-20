-- MIGRATION 0136: FIX NUCLEAR DEFINITIVO - Reconstruir todas as tabelas
-- Data: 2025-11-29
-- Objetivo: Remover TODAS as referências a funcionarios_old

PRAGMA foreign_keys=OFF;

-- ==========================================
-- 1. ALERTAS_ENVIADOS
-- ==========================================
DROP TABLE IF EXISTS alertas_enviados_backup;
CREATE TABLE IF NOT EXISTS alertas_enviados_backup AS SELECT * FROM alertas_enviados;
DROP TABLE alertas_enviados;
CREATE TABLE alertas_enviados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    funcionario_id INTEGER NOT NULL,
    qualificacao_id INTEGER,
    data_envio TEXT DEFAULT (datetime('now')),
    destinatario TEXT,
    status TEXT DEFAULT 'ENVIADO',
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
    FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_registros(id)
);
INSERT INTO alertas_enviados SELECT * FROM alertas_enviados_backup;
DROP TABLE alertas_enviados_backup;

-- ==========================================
-- 2. ARQUIVOS
-- ==========================================
DROP TABLE IF EXISTS arquivos_backup;
CREATE TABLE IF NOT EXISTS arquivos_backup AS SELECT * FROM arquivos;
DROP TABLE arquivos;
CREATE TABLE arquivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  nome_original TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  categoria TEXT DEFAULT 'geral',
  tamanho INTEGER,
  tipo TEXT,
  url_r2 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO arquivos SELECT * FROM arquivos_backup;
DROP TABLE arquivos_backup;

-- ==========================================
-- 3. COMPLIANCE_STATUS
-- ==========================================
DROP TABLE IF EXISTS compliance_status_backup;
CREATE TABLE IF NOT EXISTS compliance_status_backup AS SELECT * FROM compliance_status;
DROP TABLE compliance_status;
CREATE TABLE compliance_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  data_avaliacao TEXT NOT NULL,
  status TEXT CHECK(status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING')) NOT NULL,
  detalhes TEXT,
  avaliado_por TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO compliance_status SELECT * FROM compliance_status_backup;
DROP TABLE compliance_status_backup;

-- ==========================================
-- 4. CONSENTIMENTOS_LGPD
-- ==========================================
DROP TABLE IF EXISTS consentimentos_lgpd_backup;
CREATE TABLE IF NOT EXISTS consentimentos_lgpd_backup AS SELECT * FROM consentimentos_lgpd;
DROP TABLE consentimentos_lgpd;
CREATE TABLE consentimentos_lgpd (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('coleta_dados', 'uso_imagem', 'compartilhamento', 'tratamento_dados')),
  aceito INTEGER NOT NULL DEFAULT 0,
  data_aceite TEXT,
  ip_aceite TEXT,
  user_agent TEXT,
  revogado INTEGER DEFAULT 0,
  data_revogacao TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO consentimentos_lgpd SELECT * FROM consentimentos_lgpd_backup;
DROP TABLE consentimentos_lgpd_backup;

-- ==========================================
-- 5. DOCUMENTOS ← IMPORTANTE!
-- ==========================================
DROP TABLE IF EXISTS documentos_backup;
CREATE TABLE IF NOT EXISTS documentos_backup AS SELECT * FROM documentos;
DROP TABLE documentos;
CREATE TABLE documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO documentos SELECT * FROM documentos_backup;
DROP TABLE documentos_backup;

-- ==========================================
-- 6. FICHAS_MANOBRAS_HISTORICO
-- ==========================================
DROP TABLE IF EXISTS fichas_manobras_historico_backup;
CREATE TABLE IF NOT EXISTS fichas_manobras_historico_backup AS SELECT * FROM fichas_manobras_historico;
DROP TABLE fichas_manobras_historico;
CREATE TABLE fichas_manobras_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ficha_uuid TEXT NOT NULL,
  participante_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  manobra_codigo TEXT NOT NULL,
  manobra_nome TEXT NOT NULL,
  nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
  observacoes TEXT,
  avaliador_id INTEGER NOT NULL,
  data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
  FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);
INSERT INTO fichas_manobras_historico SELECT * FROM fichas_manobras_historico_backup;
DROP TABLE fichas_manobras_historico_backup;

-- ==========================================
-- 7. FUNCIONARIO_DOCUMENTOS
-- ==========================================
DROP TABLE IF EXISTS funcionario_documentos_backup;
CREATE TABLE IF NOT EXISTS funcionario_documentos_backup AS SELECT * FROM funcionario_documentos;
DROP TABLE funcionario_documentos;
CREATE TABLE funcionario_documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  caminho_r2 TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  descricao TEXT,
  data_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
  uploaded_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO funcionario_documentos SELECT * FROM funcionario_documentos_backup;
DROP TABLE funcionario_documentos_backup;

-- ==========================================
-- 8. FUNCIONARIOS_AERONAVES
-- ==========================================
DROP TABLE IF EXISTS funcionarios_aeronaves_backup;
CREATE TABLE IF NOT EXISTS funcionarios_aeronaves_backup AS SELECT * FROM funcionarios_aeronaves;
DROP TABLE funcionarios_aeronaves;
CREATE TABLE funcionarios_aeronaves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  aeronave_id INTEGER NOT NULL,
  data_inicio TEXT NOT NULL,
  data_fim TEXT,
  ativo INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (aeronave_id) REFERENCES aeronaves(id),
  UNIQUE(funcionario_id, aeronave_id, data_inicio)
);
INSERT INTO funcionarios_aeronaves SELECT * FROM funcionarios_aeronaves_backup;
DROP TABLE funcionarios_aeronaves_backup;

-- ==========================================
-- 9. INSTRUTORES_SIMULADOR
-- ==========================================
DROP TABLE IF EXISTS instrutores_simulador_backup;
CREATE TABLE IF NOT EXISTS instrutores_simulador_backup AS SELECT * FROM instrutores_simulador;
DROP TABLE instrutores_simulador;
CREATE TABLE instrutores_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id TEXT NOT NULL,
  habilitacoes TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO instrutores_simulador SELECT * FROM instrutores_simulador_backup;
DROP TABLE instrutores_simulador_backup;

-- ==========================================
-- 10. LICENCAS
-- ==========================================
DROP TABLE IF EXISTS licencas_backup;
CREATE TABLE IF NOT EXISTS licencas_backup AS SELECT * FROM licencas;
DROP TABLE licencas;
CREATE TABLE licencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  numero TEXT NOT NULL,
  data_emissao TEXT NOT NULL,
  data_vencimento TEXT NOT NULL,
  observacoes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO licencas SELECT * FROM licencas_backup;
DROP TABLE licencas_backup;

-- ==========================================
-- 11. LOGS_ACESSO_DADOS
-- ==========================================
DROP TABLE IF EXISTS logs_acesso_dados_backup;
CREATE TABLE IF NOT EXISTS logs_acesso_dados_backup AS SELECT * FROM logs_acesso_dados;
DROP TABLE logs_acesso_dados;
CREATE TABLE logs_acesso_dados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  usuario_id INTEGER,
  acao TEXT NOT NULL CHECK(acao IN ('READ', 'UPDATE', 'DELETE', 'EXPORT')),
  campos_acessados TEXT,
  ip TEXT,
  user_agent TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO logs_acesso_dados SELECT * FROM logs_acesso_dados_backup;
DROP TABLE logs_acesso_dados_backup;

-- ==========================================
-- 12. NOTIFICACOES
-- ==========================================
DROP TABLE IF EXISTS notificacoes_backup;
CREATE TABLE IF NOT EXISTS notificacoes_backup AS SELECT * FROM notificacoes;
DROP TABLE notificacoes;
CREATE TABLE notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    funcionario_id INTEGER,
    lida BOOLEAN DEFAULT 0,
    data_envio TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO notificacoes SELECT * FROM notificacoes_backup;
DROP TABLE notificacoes_backup;

-- ==========================================
-- Reabilitar FKs
-- ==========================================
PRAGMA foreign_keys=ON;

SELECT 'Migration 0136: Todas as 12 tabelas foram reconstruídas com FKs corretas' AS resultado;
