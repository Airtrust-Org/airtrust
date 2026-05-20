-- ============================================================
-- MIGRATION 0062: SSOT Extensão - Tabelas Dependentes, Índices e Triggers Reativos
-- Data: 2025-11-21
-- Objetivo: Completar arquitetura SSOT adicionando módulos dependentes
--           (hospedagens, registros_frms, auditoria_avancada_v2) e
--           triggers reativos + índices recomendados.
-- ============================================================

-- Tabela hospedagens (se não existir)
CREATE TABLE IF NOT EXISTS hospedagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  hotel TEXT NOT NULL,
  quarto TEXT,
  data_checkin TEXT NOT NULL,
  data_checkout TEXT NOT NULL,
  valor REAL NOT NULL,
  status TEXT CHECK(status IN ('reservado', 'confirmado', 'cancelado', 'finalizado')) DEFAULT 'reservado',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hospedagens_funcionario ON hospedagens(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hospedagens_status ON hospedagens(status) WHERE deleted_at IS NULL;

-- Tabela registros_frms (se não existir)
CREATE TABLE IF NOT EXISTS registros_frms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  data_registro TEXT NOT NULL,
  horas_sono REAL NOT NULL CHECK(horas_sono >= 0 AND horas_sono <= 24),
  nivel_fadiga INTEGER CHECK(nivel_fadiga BETWEEN 1 AND 10) NOT NULL,
  sintomas TEXT,
  apto_voo INTEGER DEFAULT 1,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_frms_funcionario ON registros_frms(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_frms_data ON registros_frms(data_registro) WHERE deleted_at IS NULL;

-- Auditoria avançada v2 (ajuste incremental sobre schema existente remoto)
-- Schema remoto atual possui: id, tabela, acao, registro_id, dados_anteriores, dados_novos, created_at
-- Adicionar colunas faltantes (usuario_id, ip_address, user_agent, origem) e índices.
CREATE TABLE IF NOT EXISTS auditoria_avancada_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  acao TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  dados_anteriores TEXT,
  dados_novos TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Colunas adicionais (tolerar erro se já adicionadas futuramente)
ALTER TABLE auditoria_avancada_v2 ADD COLUMN usuario_id INTEGER;
ALTER TABLE auditoria_avancada_v2 ADD COLUMN ip_address TEXT;
ALTER TABLE auditoria_avancada_v2 ADD COLUMN user_agent TEXT;
ALTER TABLE auditoria_avancada_v2 ADD COLUMN origem TEXT DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_registro ON auditoria_avancada_v2(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria_avancada_v2(created_at);
CREATE INDEX IF NOT EXISTS idx_auditoria_acao ON auditoria_avancada_v2(acao);

-- Índices adicionais (funcionarios) se não existentes
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_setor ON funcionarios(setor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_codigo_anac ON funcionarios(codigo_anac) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_cargo ON funcionarios(cargo) WHERE deleted_at IS NULL;

-- Triggers
DROP TRIGGER IF EXISTS trg_funcionarios_update;
CREATE TRIGGER trg_funcionarios_update
AFTER UPDATE ON funcionarios
FOR EACH ROW
WHEN NEW.updated_at != OLD.updated_at
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela, registro_id, acao, dados_anteriores, dados_novos, origem
  ) VALUES (
    'funcionarios', NEW.id, 'UPDATE',
    json_object('nome', OLD.nome, 'email', OLD.email, 'status', OLD.status, 'cargo', OLD.cargo, 'setor', OLD.setor, 'codigo_anac', OLD.codigo_anac),
    json_object('nome', NEW.nome, 'email', NEW.email, 'status', NEW.status, 'cargo', NEW.cargo, 'setor', NEW.setor, 'codigo_anac', NEW.codigo_anac),
    'system'
  );
END;

DROP TRIGGER IF EXISTS trg_funcionarios_prevent_hard_delete;
CREATE TRIGGER trg_funcionarios_prevent_hard_delete
BEFORE DELETE ON funcionarios
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'DELETE físico proibido. Use soft delete (UPDATE deleted_at)');
END;

DROP TRIGGER IF EXISTS trg_funcionarios_soft_delete;
CREATE TRIGGER trg_funcionarios_soft_delete
AFTER UPDATE OF deleted_at ON funcionarios
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico SET deleted_at = datetime('now') WHERE funcionario_id = NEW.id AND deleted_at IS NULL;
  UPDATE sessoes_simulador SET deleted_at = datetime('now') WHERE (funcionario_id = NEW.id OR instrutor_id = NEW.id) AND deleted_at IS NULL;
  UPDATE hospedagens SET deleted_at = datetime('now') WHERE funcionario_id = NEW.id AND deleted_at IS NULL;
  UPDATE registros_frms SET deleted_at = datetime('now') WHERE funcionario_id = NEW.id AND deleted_at IS NULL;
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem) VALUES ('funcionarios', NEW.id, 'SOFT_DELETE', 'system');
END;

DROP TRIGGER IF EXISTS trg_funcionarios_updated_at;
CREATE TRIGGER trg_funcionarios_updated_at
BEFORE UPDATE ON funcionarios
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.updated_at = OLD.updated_at THEN (SET_UPDATE_TIME) END;
END;
-- Nota: D1 não suporta alterar NEW diretamente via expressão custom; manter updated_at gerenciado pela aplicação.

-- ============================================================
-- Fim Migration 0062
-- ============================================================
