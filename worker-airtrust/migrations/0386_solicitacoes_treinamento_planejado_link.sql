-- AirTrust - M1 Treinamentos Link
-- Backward-compatible for verified production schema where columns are absent.
-- Probe evidence: treinamento_planejado_id=no, status_pre_agendamento=no, index=no.
-- No backfill. No destructive changes.

ALTER TABLE solicitacoes_treinamento ADD COLUMN treinamento_planejado_id INTEGER;
ALTER TABLE solicitacoes_treinamento ADD COLUMN status_pre_agendamento TEXT;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_treinamento_planejado
  ON solicitacoes_treinamento(treinamento_planejado_id)
  WHERE treinamento_planejado_id IS NOT NULL;
