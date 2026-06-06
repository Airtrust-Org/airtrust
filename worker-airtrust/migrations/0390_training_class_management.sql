-- Training class management, additive evolution of treinamentos_planejados.

ALTER TABLE treinamentos_planejados ADD COLUMN codigo_turma TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN modalidade TEXT NOT NULL DEFAULT 'TEORICO';
ALTER TABLE treinamentos_planejados ADD COLUMN data_inicio TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN data_fim TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN base TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN sala TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN equipamento_descricao TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN limite_participantes INTEGER;

ALTER TABLE treinamentos_participantes ADD COLUMN status_participacao TEXT NOT NULL DEFAULT 'MATRICULADO';
ALTER TABLE treinamentos_participantes ADD COLUMN resultado TEXT;
ALTER TABLE treinamentos_participantes ADD COLUMN conceito TEXT;
ALTER TABLE treinamentos_participantes ADD COLUMN data_conclusao_efetiva TEXT;
ALTER TABLE treinamentos_participantes ADD COLUMN concluido_em TEXT;
ALTER TABLE treinamentos_participantes ADD COLUMN concluido_por INTEGER;

CREATE TABLE IF NOT EXISTS treinamentos_dias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  hora_inicio TEXT NOT NULL DEFAULT '08:00',
  hora_fim TEXT NOT NULL DEFAULT '17:00',
  local TEXT,
  instrutor_id INTEGER,
  simulador_id INTEGER,
  aeronave_id INTEGER,
  sessao_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ATIVO'
    CHECK(status IN ('ATIVO', 'CANCELADO', 'SUBSTITUIDO')),
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  UNIQUE(treinamento_id, data)
);

CREATE TABLE IF NOT EXISTS treinamentos_instrutores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  papel TEXT NOT NULL DEFAULT 'INSTRUTOR',
  principal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  UNIQUE(treinamento_id, funcionario_id)
);

CREATE TABLE IF NOT EXISTS treinamentos_presencas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_dia_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK(status IN ('PENDENTE', 'PRESENTE', 'AUSENTE', 'PARCIAL', 'DISPENSADO')),
  minutos_presentes INTEGER,
  observacoes TEXT,
  registrado_por INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_dia_id) REFERENCES treinamentos_dias(id) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES treinamentos_participantes(id) ON DELETE CASCADE,
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id),
  UNIQUE(treinamento_dia_id, participante_id)
);

CREATE TABLE IF NOT EXISTS treinamentos_qualificacoes_geradas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  qualificacao_tipo_id INTEGER NOT NULL,
  qualificacao_historico_id INTEGER NOT NULL,
  data_conclusao_efetiva TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (treinamento_id) REFERENCES treinamentos_planejados(id) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES treinamentos_participantes(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (qualificacao_tipo_id) REFERENCES qualificacoes_tipos(id),
  FOREIGN KEY (qualificacao_historico_id) REFERENCES qualificacoes_historico(id),
  UNIQUE(empresa_id, treinamento_id, participante_id, qualificacao_tipo_id, data_conclusao_efetiva),
  UNIQUE(qualificacao_historico_id)
);

CREATE INDEX IF NOT EXISTS idx_treinamentos_dias_empresa_data
  ON treinamentos_dias(empresa_id, data, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamentos_dias_treinamento
  ON treinamentos_dias(treinamento_id, data) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_treinamentos_instrutores_empresa_funcionario
  ON treinamentos_instrutores(empresa_id, funcionario_id);
CREATE INDEX IF NOT EXISTS idx_treinamentos_presencas_participante
  ON treinamentos_presencas(participante_id, treinamento_dia_id);
CREATE INDEX IF NOT EXISTS idx_treinamentos_qualificacoes_origem
  ON treinamentos_qualificacoes_geradas(empresa_id, treinamento_id, funcionario_id);

CREATE TRIGGER IF NOT EXISTS trg_treinamentos_dias_updated_at
AFTER UPDATE ON treinamentos_dias
FOR EACH ROW
BEGIN
  UPDATE treinamentos_dias SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_treinamentos_instrutores_updated_at
AFTER UPDATE ON treinamentos_instrutores
FOR EACH ROW
BEGIN
  UPDATE treinamentos_instrutores SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_treinamentos_presencas_updated_at
AFTER UPDATE ON treinamentos_presencas
FOR EACH ROW
BEGIN
  UPDATE treinamentos_presencas SET updated_at = datetime('now') WHERE id = NEW.id;
END;
