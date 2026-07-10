-- Migration 0421: Relação explícita M:N entre segmentos compartilhados e atribuições curriculares.
--
-- Aditiva por desenho:
-- - mantém os campos legados simulador_agendamento_segmentos.atribuicao_curricular_id
--   e simulador_segmento_participantes.atribuicao_curricular_id;
-- - não converte sessões/fichas históricas;
-- - permite leitura nova por relações ativas e fallback legado quando não houver relação.

ALTER TABLE simulador_agendamento_segmentos
  ADD COLUMN finalidade_codigo TEXT NOT NULL DEFAULT 'OUTRO'
  CHECK (finalidade_codigo IN ('SOP_NORMAL', 'SOP_ANORMAL_EMERGENCIA', 'ATUACAO_EXAMINADOR', 'OUTRO'));

ALTER TABLE simulador_agendamento_segmentos
  ADD COLUMN finalidade_titulo TEXT;

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
  FOREIGN KEY (segmento_id) REFERENCES simulador_agendamento_segmentos(id),
  FOREIGN KEY (atribuicao_curricular_id) REFERENCES simulador_atribuicoes_curriculares(id)
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

CREATE TABLE IF NOT EXISTS modelos_sessao_requisitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  modelo_sessao_id INTEGER NOT NULL,
  requisito_modelo_sessao_id INTEGER NOT NULL,
  tipo_requisito TEXT NOT NULL DEFAULT 'ETAPA_ANTERIOR'
    CHECK(tipo_requisito IN ('ETAPA_ANTERIOR', 'OBSERVACAO', 'OUTRO')),
  obrigatorio INTEGER NOT NULL DEFAULT 1 CHECK(obrigatorio IN (0, 1)),
  ordem INTEGER,
  observacao TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (modelo_sessao_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY (requisito_modelo_sessao_id) REFERENCES modelos_sessao(id)
);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_empresa
  ON modelos_sessao_requisitos(empresa_id);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_modelo
  ON modelos_sessao_requisitos(modelo_sessao_id);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_requisito
  ON modelos_sessao_requisitos(requisito_modelo_sessao_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_modelos_sessao_requisitos_ativo
  ON modelos_sessao_requisitos(modelo_sessao_id, requisito_modelo_sessao_id, tipo_requisito)
  WHERE deleted_at IS NULL;
