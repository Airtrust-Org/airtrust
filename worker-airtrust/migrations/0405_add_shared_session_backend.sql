-- ============================================================
-- Migration: 0405_add_shared_session_backend.sql
-- Module: Simuladores
-- Description: Additive backend model for shared simulator sessions
--              with curricular assignments, time segments, and
--              per-segment PF/PM participant roles.
-- Safety: additive only; no legacy data conversion
-- ============================================================

ALTER TABLE simulador_agendamentos
  ADD COLUMN modo_compartilhado INTEGER NOT NULL DEFAULT 0 CHECK (modo_compartilhado IN (0, 1));

CREATE TABLE simulador_atribuicoes_curriculares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  agendamento_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  treinamento_planejado_id INTEGER,
  modelo_sessao_id INTEGER,
  gera_ficha INTEGER NOT NULL DEFAULT 1 CHECK (gera_ficha IN (0, 1)),
  carga_horaria_total_minutos INTEGER NOT NULL DEFAULT 0 CHECK (carga_horaria_total_minutos >= 0),
  status TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA', 'CANCELADA', 'CONCLUIDA')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (agendamento_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (participante_id) REFERENCES sessoes_participantes(id),
  FOREIGN KEY (treinamento_planejado_id) REFERENCES treinamentos_planejados(id),
  FOREIGN KEY (modelo_sessao_id) REFERENCES modelos_sessao(id)
);

CREATE INDEX idx_sim_atribuicoes_empresa
  ON simulador_atribuicoes_curriculares(empresa_id);
CREATE INDEX idx_sim_atribuicoes_agendamento
  ON simulador_atribuicoes_curriculares(agendamento_id);
CREATE INDEX idx_sim_atribuicoes_participante
  ON simulador_atribuicoes_curriculares(participante_id);
CREATE UNIQUE INDEX idx_sim_atribuicoes_ativas_por_participante
  ON simulador_atribuicoes_curriculares(agendamento_id, participante_id)
  WHERE deleted_at IS NULL;

CREATE TABLE simulador_agendamento_segmentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  agendamento_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL CHECK (duracao_minutos > 0),
  atribuicao_curricular_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'CANCELADO')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (agendamento_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (atribuicao_curricular_id) REFERENCES simulador_atribuicoes_curriculares(id),
  CHECK (inicio <> fim)
);

CREATE INDEX idx_sim_segmentos_empresa
  ON simulador_agendamento_segmentos(empresa_id);
CREATE INDEX idx_sim_segmentos_agendamento
  ON simulador_agendamento_segmentos(agendamento_id);
CREATE INDEX idx_sim_segmentos_atribuicao
  ON simulador_agendamento_segmentos(atribuicao_curricular_id);
CREATE UNIQUE INDEX idx_sim_segmentos_ordem_ativa
  ON simulador_agendamento_segmentos(agendamento_id, ordem)
  WHERE deleted_at IS NULL;

CREATE TABLE simulador_segmento_participantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  segmento_id INTEGER NOT NULL,
  participante_id INTEGER NOT NULL,
  funcao TEXT NOT NULL CHECK (funcao IN ('PF', 'PM')),
  duracao_minutos INTEGER NOT NULL CHECK (duracao_minutos > 0),
  atribuicao_curricular_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (segmento_id) REFERENCES simulador_agendamento_segmentos(id),
  FOREIGN KEY (participante_id) REFERENCES sessoes_participantes(id),
  FOREIGN KEY (atribuicao_curricular_id) REFERENCES simulador_atribuicoes_curriculares(id)
);

CREATE INDEX idx_sim_segmento_participantes_empresa
  ON simulador_segmento_participantes(empresa_id);
CREATE INDEX idx_sim_segmento_participantes_segmento
  ON simulador_segmento_participantes(segmento_id);
CREATE INDEX idx_sim_segmento_participantes_participante
  ON simulador_segmento_participantes(participante_id);
CREATE INDEX idx_sim_segmento_participantes_atribuicao
  ON simulador_segmento_participantes(atribuicao_curricular_id);
CREATE UNIQUE INDEX idx_sim_segmento_participantes_ativo
  ON simulador_segmento_participantes(segmento_id, participante_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_sim_segmento_funcao_unica
  ON simulador_segmento_participantes(segmento_id, funcao)
  WHERE deleted_at IS NULL;

ALTER TABLE fichas_sessao
  ADD COLUMN atribuicao_curricular_id INTEGER REFERENCES simulador_atribuicoes_curriculares(id);

CREATE INDEX idx_fichas_sessao_atribuicao
  ON fichas_sessao(atribuicao_curricular_id);
CREATE UNIQUE INDEX idx_fichas_sessao_atribuicao_ativa
  ON fichas_sessao(atribuicao_curricular_id)
  WHERE atribuicao_curricular_id IS NOT NULL
    AND deleted_at IS NULL;
