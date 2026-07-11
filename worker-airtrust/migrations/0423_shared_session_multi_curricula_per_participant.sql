-- Migration 0423: shared session curricular segments per participant+model.
--
-- Goals:
-- - allow multiple active curricular assignments for the same participant inside
--   one appointment when they belong to different modelos_sessao;
-- - promote ficha ownership from atribuicao_curricular_id to
--   segmento_atribuicao_id without breaking historical reads;
-- - keep the change additive/compensatory for SQLite/D1.

DROP INDEX IF EXISTS idx_sim_atribuicoes_ativas_por_participante;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sim_atribuicoes_ativas_por_participante_modelo
  ON simulador_atribuicoes_curriculares(
    agendamento_id,
    participante_id,
    COALESCE(modelo_sessao_id, -1)
  )
  WHERE deleted_at IS NULL;

ALTER TABLE simulador_segmento_atribuicoes
  ADD COLUMN gera_ficha INTEGER NOT NULL DEFAULT 1 CHECK (gera_ficha IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_segmento_atribuicoes_id_empresa
  ON simulador_segmento_atribuicoes(id, empresa_id);

ALTER TABLE fichas_sessao
  ADD COLUMN segmento_atribuicao_id INTEGER REFERENCES simulador_segmento_atribuicoes(id);

DROP INDEX IF EXISTS idx_fichas_sessao_atribuicao_ativa;

CREATE INDEX IF NOT EXISTS idx_fichas_sessao_segmento_atribuicao
  ON fichas_sessao(segmento_atribuicao_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fichas_sessao_segmento_atribuicao_ativa
  ON fichas_sessao(segmento_atribuicao_id)
  WHERE segmento_atribuicao_id IS NOT NULL
    AND deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_sim_atribuicoes_curriculares_tenant_guard_insert
BEFORE INSERT ON simulador_atribuicoes_curriculares
FOR EACH ROW
BEGIN
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM simulador_agendamentos sa
        WHERE sa.id = NEW.agendamento_id
          AND sa.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.agendamento cross-tenant')
    END;

  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM sessoes_participantes sp
        INNER JOIN simulador_agendamentos sa
          ON sa.id = sp.sessao_id
        WHERE sp.id = NEW.participante_id
          AND sa.id = NEW.agendamento_id
          AND sa.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.participante cross-tenant')
    END;

  SELECT
    CASE
      WHEN NEW.modelo_sessao_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM modelos_sessao ms
         WHERE ms.id = NEW.modelo_sessao_id
           AND ms.empresa_id = NEW.empresa_id
       ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.modelo cross-tenant')
    END;

  SELECT
    CASE
      WHEN NEW.treinamento_planejado_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM treinamentos_planejados tp
         WHERE tp.id = NEW.treinamento_planejado_id
           AND tp.empresa_id = NEW.empresa_id
       ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.treinamento cross-tenant')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_sim_atribuicoes_curriculares_tenant_guard_update
BEFORE UPDATE ON simulador_atribuicoes_curriculares
FOR EACH ROW
BEGIN
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM simulador_agendamentos sa
        WHERE sa.id = NEW.agendamento_id
          AND sa.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.agendamento cross-tenant')
    END;

  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM sessoes_participantes sp
        INNER JOIN simulador_agendamentos sa
          ON sa.id = sp.sessao_id
        WHERE sp.id = NEW.participante_id
          AND sa.id = NEW.agendamento_id
          AND sa.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.participante cross-tenant')
    END;

  SELECT
    CASE
      WHEN NEW.modelo_sessao_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM modelos_sessao ms
         WHERE ms.id = NEW.modelo_sessao_id
           AND ms.empresa_id = NEW.empresa_id
       ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.modelo cross-tenant')
    END;

  SELECT
    CASE
      WHEN NEW.treinamento_planejado_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM treinamentos_planejados tp
         WHERE tp.id = NEW.treinamento_planejado_id
           AND tp.empresa_id = NEW.empresa_id
       ) THEN RAISE(ABORT, 'simulador_atribuicoes_curriculares.treinamento cross-tenant')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_fichas_sessao_segmento_atribuicao_tenant_guard_insert
BEFORE INSERT ON fichas_sessao
FOR EACH ROW
WHEN NEW.segmento_atribuicao_id IS NOT NULL
BEGIN
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM simulador_segmento_atribuicoes ssa
        WHERE ssa.id = NEW.segmento_atribuicao_id
          AND ssa.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'fichas_sessao.segmento_atribuicao cross-tenant')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_fichas_sessao_segmento_atribuicao_tenant_guard_update
BEFORE UPDATE ON fichas_sessao
FOR EACH ROW
WHEN NEW.segmento_atribuicao_id IS NOT NULL
BEGIN
  SELECT
    CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM simulador_segmento_atribuicoes ssa
        WHERE ssa.id = NEW.segmento_atribuicao_id
          AND ssa.empresa_id = NEW.empresa_id
      ) THEN RAISE(ABORT, 'fichas_sessao.segmento_atribuicao cross-tenant')
    END;
END;
