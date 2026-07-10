-- Migration 0421: Relação explícita M:N entre segmentos compartilhados e atribuições curriculares.
--
-- Aditiva por desenho:
-- - mantém os campos legados simulador_agendamento_segmentos.atribuicao_curricular_id
--   e simulador_segmento_participantes.atribuicao_curricular_id;
-- - não converte sessões/fichas históricas;
-- - permite leitura nova por relações ativas e fallback legado quando não houver relação.
-- Rollback manual local:
-- - criar tabela _simulador_agendamento_segmentos_new sem finalidade_codigo/finalidade_titulo;
-- - copiar dados de simulador_agendamento_segmentos para _simulador_agendamento_segmentos_new;
-- - DROP TABLE simulador_agendamento_segmentos;
-- - ALTER TABLE _simulador_agendamento_segmentos_new RENAME TO simulador_agendamento_segmentos;
-- - DROP INDEX IF EXISTS idx_sim_segmento_atribuicoes_ativa;
-- - DROP INDEX IF EXISTS idx_sim_segmento_atribuicoes_atribuicao;
-- - DROP INDEX IF EXISTS idx_sim_segmento_atribuicoes_segmento;
-- - DROP INDEX IF EXISTS idx_sim_segmento_atribuicoes_empresa;
-- - DROP INDEX IF EXISTS uq_sim_agendamento_segmentos_id_empresa;
-- - DROP INDEX IF EXISTS uq_sim_atribuicoes_curriculares_id_empresa;
-- - DROP TABLE IF EXISTS simulador_segmento_atribuicoes;

ALTER TABLE simulador_agendamento_segmentos
  ADD COLUMN finalidade_codigo TEXT NOT NULL DEFAULT 'OUTRO'
  CHECK (finalidade_codigo IN ('SOP_NORMAL', 'SOP_ANORMAL_EMERGENCIA', 'ATUACAO_EXAMINADOR', 'OUTRO'));

ALTER TABLE simulador_agendamento_segmentos
  ADD COLUMN finalidade_titulo TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_agendamento_segmentos_id_empresa
  ON simulador_agendamento_segmentos(id, empresa_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_atribuicoes_curriculares_id_empresa
  ON simulador_atribuicoes_curriculares(id, empresa_id);

CREATE TABLE IF NOT EXISTS simulador_segmento_atribuicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  segmento_id INTEGER NOT NULL,
  atribuicao_curricular_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PLANEJADA' CHECK(status IN ('PLANEJADA', 'CUMPRIDA', 'CANCELADA')),
  observacao TEXT,
  concluido_em TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (segmento_id, empresa_id) REFERENCES simulador_agendamento_segmentos(id, empresa_id),
  FOREIGN KEY (atribuicao_curricular_id, empresa_id) REFERENCES simulador_atribuicoes_curriculares(id, empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_sim_segmento_atribuicoes_empresa
  ON simulador_segmento_atribuicoes(empresa_id);

CREATE INDEX IF NOT EXISTS idx_sim_segmento_atribuicoes_segmento
  ON simulador_segmento_atribuicoes(segmento_id);

CREATE INDEX IF NOT EXISTS idx_sim_segmento_atribuicoes_atribuicao
  ON simulador_segmento_atribuicoes(atribuicao_curricular_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_segmento_atribuicoes_ativa
  ON simulador_segmento_atribuicoes(segmento_id, atribuicao_curricular_id)
  WHERE deleted_at IS NULL;
