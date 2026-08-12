-- Migration 0460: Simulator future planning on canonical treinamentos_planejados.
--
-- Additive only: planning proposals remain inside the existing training domain,
-- without creating qualification history or scale events until the plan reaches
-- the operational scheduling stage through the application service.

ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_status TEXT
  CHECK (
    planejamento_status IS NULL OR planejamento_status IN (
      'PROPOSTO',
      'PLANEJADO',
      'AGUARDANDO_DISPONIBILIDADE',
      'CONFIRMADO',
      'AGENDADO',
      'REALIZADO',
      'REPLANEJAR',
      'CANCELADO'
    )
  );

ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_origem TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_chave TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_editado_manualmente INTEGER NOT NULL DEFAULT 0
  CHECK (planejamento_editado_manualmente IN (0, 1));
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_vencimento_referencia TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_margem_dias INTEGER
  CHECK (planejamento_margem_dias IS NULL OR planejamento_margem_dias >= 0);
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_quinzena_numero INTEGER
  CHECK (planejamento_quinzena_numero IS NULL OR planejamento_quinzena_numero IN (1, 2));
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_politica_janela TEXT
  CHECK (
    planejamento_politica_janela IS NULL OR planejamento_politica_janela IN (
      'FOLGA', 'QUINZENA_ATIVA', 'AMBOS'
    )
  );
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_tipo_janela TEXT
  CHECK (
    planejamento_tipo_janela IS NULL OR planejamento_tipo_janela IN (
      'FOLGA', 'QUINZENA_ATIVA'
    )
  );
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_janela_inicio TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_janela_fim TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_modelo_aeronave TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_conflitos_json TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_snapshot_json TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_recalculado_em TEXT;
ALTER TABLE treinamentos_planejados ADD COLUMN planejamento_recalculado_por INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamentos_planejamento_chave_empresa
  ON treinamentos_planejados(empresa_id, planejamento_chave)
  WHERE deleted_at IS NULL AND planejamento_chave IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_treinamentos_planejamento_status
  ON treinamentos_planejados(empresa_id, planejamento_status, data_prevista)
  WHERE deleted_at IS NULL AND planejamento_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS simulador_planejamento_auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  treinamento_planejado_id INTEGER,
  acao TEXT NOT NULL,
  planejamento_status TEXT,
  snapshot_antes_json TEXT,
  snapshot_depois_json TEXT,
  realizado_por INTEGER,
  realizado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (treinamento_planejado_id) REFERENCES treinamentos_planejados(id)
);

CREATE INDEX IF NOT EXISTS idx_simulador_planejamento_auditoria_treinamento
  ON simulador_planejamento_auditoria(empresa_id, treinamento_planejado_id, realizado_em);

CREATE TRIGGER IF NOT EXISTS trg_simulador_planejamento_auditoria_tenant_insert
BEFORE INSERT ON simulador_planejamento_auditoria
WHEN NEW.treinamento_planejado_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM treinamentos_planejados t
     WHERE t.id = NEW.treinamento_planejado_id
       AND t.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'simulador_planejamento_auditoria tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_simulador_planejamento_auditoria_tenant_update
BEFORE UPDATE OF empresa_id, treinamento_planejado_id ON simulador_planejamento_auditoria
WHEN NEW.treinamento_planejado_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM treinamentos_planejados t
     WHERE t.id = NEW.treinamento_planejado_id
       AND t.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'simulador_planejamento_auditoria tenant mismatch') END;
END;
