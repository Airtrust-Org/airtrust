-- Migration: Sistema de Checks com Examinadores
-- Data: 2026-01-13
-- Descrição: Adiciona funcionalidade de checks de voo com examinadores e geração automática de qualificações

-- 1. Adicionar campo is_examinador em funcionarios
ALTER TABLE funcionarios ADD COLUMN is_examinador INTEGER NOT NULL DEFAULT 0;

-- 2. Adicionar campos de examinador e check em simulador_agendamentos
ALTER TABLE simulador_agendamentos ADD COLUMN examinador_id INTEGER NULL;
ALTER TABLE simulador_agendamentos ADD COLUMN is_check INTEGER NOT NULL DEFAULT 0;

-- 3. Criar tabela tipos_check
CREATE TABLE IF NOT EXISTS tipos_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  qualificacao_tipo_id INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- 4. Criar tabela sessoes_checks (relacionamento sessão-check)
CREATE TABLE IF NOT EXISTS sessoes_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id)
);

-- 5. Criar tabela sessoes_checks_resultados (resultado de cada check)
CREATE TABLE IF NOT EXISTS sessoes_checks_resultados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_check_id INTEGER NOT NULL,
  aprovado INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_check_id) REFERENCES sessoes_checks(id)
);

-- 6. Adicionar campo tipo_check_id em qualificacoes_historico (para rastreabilidade)
ALTER TABLE qualificacoes_historico ADD COLUMN tipo_check_id INTEGER NULL;
ALTER TABLE qualificacoes_historico ADD COLUMN sessao_id INTEGER NULL;

-- 7. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_funcionarios_examinador ON funcionarios(is_examinador, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessoes_examinador ON simulador_agendamentos(examinador_id, is_check, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tipos_check_deleted ON tipos_check(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessoes_checks_sessao ON sessoes_checks(sessao_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessoes_checks_tipo ON sessoes_checks(qualificacao_tipo_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_checks_resultados ON sessoes_checks_resultados(sessao_check_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_check ON qualificacoes_historico(tipo_check_id, sessao_id);

-- 8. Inserir alguns tipos de check comuns
INSERT INTO tipos_check (codigo, nome, descricao) VALUES
  ('PC-IFR', 'Proficiency Check IFR', 'Verificação de proficiência de voo por instrumentos'),
  ('PC-VFR', 'Proficiency Check VFR', 'Verificação de proficiência de voo visual'),
  ('OPC', 'Operator Proficiency Check', 'Verificação de proficiência do operador'),
  ('LPC', 'License Proficiency Check', 'Verificação de proficiência de licença'),
  ('CHECK-TIPO', 'Cheque de Tipo', 'Verificação de capacidade em tipo de aeronave específico');

-- 9. Auditoria
INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_novos)
VALUES ('system', 'MIGRATION', '0098', json_object(
  'migration', '0098_add_examinador_checks',
  'timestamp', datetime('now'),
  'description', 'Sistema de checks com examinadores implementado'
));
