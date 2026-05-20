-- =====================================================
-- MIGRAÇÃO 0150: Sistema Enterprise de Backup/Restore
-- Data: 07/12/2025
-- Compliance: FAA AC 120-78B | ANAC RBAC 121
-- =====================================================

-- Tabela central de controle de backups
CREATE TABLE IF NOT EXISTS backups_controle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK(tipo IN ('COMPLETO', 'MODULAR', 'INCREMENTAL', 'TIME_TRAVEL')),
  escopo TEXT NOT NULL, -- 'GERAL' ou nome do módulo
  status TEXT NOT NULL DEFAULT 'INICIADO' CHECK(status IN ('INICIADO', 'EM_PROGRESSO', 'CONCLUIDO', 'FALHOU', 'RESTAURANDO')),
  
  -- Métricas
  tamanho_bytes INTEGER,
  total_registros INTEGER,
  total_tabelas INTEGER,
  duracao_segundos INTEGER,
  
  -- Storage R2
  r2_bucket TEXT NOT NULL DEFAULT 'airtrust-backups',
  r2_path TEXT NOT NULL,
  r2_checksum_sha256 TEXT,
  
  -- Metadata
  d1_backup_id TEXT,
  modulos_incluidos TEXT, -- JSON array
  triggered_by TEXT NOT NULL, -- 'MANUAL', 'CRON_DIARIO', 'CRON_SEMANAL', 'PRE_DEPLOY'
  usuarios_id INTEGER,
  descricao TEXT,
  
  -- Compliance e Auditoria
  retention_policy TEXT NOT NULL DEFAULT '7_ANOS', -- '30_DIAS', '1_ANO', '7_ANOS'
  expires_at TEXT,
  compliance_tags TEXT, -- JSON
  
  -- Restore
  restaurado_em TEXT,
  restaurado_por INTEGER,
  restore_log TEXT, -- JSON
  
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  
  FOREIGN KEY (usuarios_id) REFERENCES usuarios(id),
  FOREIGN KEY (restaurado_por) REFERENCES usuarios(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_backups_tipo_status ON backups_controle(tipo, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_backups_escopo_created ON backups_controle(escopo, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_backups_expires ON backups_controle(expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backups_uuid ON backups_controle(uuid) WHERE deleted_at IS NULL;

-- Tabela de logs detalhados (relacionamento 1:N)
CREATE TABLE IF NOT EXISTS backups_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backups_controle_id INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nivel TEXT NOT NULL CHECK(nivel IN ('INFO', 'WARN', 'ERROR', 'SUCCESS')),
  mensagem TEXT NOT NULL,
  detalhes TEXT, -- JSON
  tabela_afetada TEXT,
  registros_processados INTEGER,
  
  FOREIGN KEY (backups_controle_id) REFERENCES backups_controle(id)
);

CREATE INDEX IF NOT EXISTS idx_backups_logs_controle ON backups_logs(backups_controle_id, timestamp DESC);

-- Trigger de auditoria para backups
CREATE TRIGGER IF NOT EXISTS trg_backups_controle_audit
AFTER INSERT ON backups_controle
FOR EACH ROW
BEGIN
  INSERT INTO auditoriaavancadav2 (
    usuarios_id,
    acao,
    entidade,
    entidade_id,
    detalhes,
    created_at
  ) VALUES (
    NEW.usuarios_id,
    'BACKUP_CRIADO',
    'backups_controle',
    NEW.id,
    json_object(
      'uuid', NEW.uuid,
      'tipo', NEW.tipo,
      'escopo', NEW.escopo,
      'triggered_by', NEW.triggered_by
    ),
    CURRENT_TIMESTAMP
  );
END;

-- Trigger de auditoria para restore
CREATE TRIGGER IF NOT EXISTS trg_backups_restore_audit
AFTER UPDATE OF restaurado_em ON backups_controle
FOR EACH ROW
WHEN NEW.restaurado_em IS NOT NULL AND OLD.restaurado_em IS NULL
BEGIN
  INSERT INTO auditoriaavancadav2 (
    usuarios_id,
    acao,
    entidade,
    entidade_id,
    detalhes,
    created_at
  ) VALUES (
    NEW.restaurado_por,
    'BACKUP_RESTAURADO',
    'backups_controle',
    NEW.id,
    json_object(
      'uuid', NEW.uuid,
      'tipo', NEW.tipo,
      'escopo', NEW.escopo
    ),
    CURRENT_TIMESTAMP
  );
END;

-- View para monitoramento de backups
CREATE VIEW IF NOT EXISTS vw_backups_monitoramento AS
SELECT 
  bc.id,
  bc.uuid,
  bc.tipo,
  bc.escopo,
  bc.status,
  bc.tamanho_bytes,
  bc.total_registros,
  bc.duracao_segundos,
  bc.triggered_by,
  bc.retention_policy,
  bc.expires_at,
  bc.created_at,
  bc.restaurado_em,
  u1.nome as criado_por_nome,
  u2.nome as restaurado_por_nome,
  CASE 
    WHEN bc.expires_at < datetime('now') THEN 'EXPIRADO'
    WHEN bc.expires_at < datetime('now', '+30 days') THEN 'EXPIRANDO_EM_BREVE'
    ELSE 'ATIVO'
  END as status_retencao,
  (SELECT COUNT(*) FROM backups_logs WHERE backups_controle_id = bc.id AND nivel = 'ERROR') as total_erros
FROM backups_controle bc
LEFT JOIN usuarios u1 ON bc.usuarios_id = u1.id
LEFT JOIN usuarios u2 ON bc.restaurado_por = u2.id
WHERE bc.deleted_at IS NULL
ORDER BY bc.created_at DESC;
