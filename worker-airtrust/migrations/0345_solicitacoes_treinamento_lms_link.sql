-- Migration: 0345_solicitacoes_treinamento_lms_link
-- Bloco 5.2: Adiciona vínculo entre solicitações de treinamento e matrículas LMS

ALTER TABLE solicitacoes_treinamento
ADD COLUMN lms_matricula_id INTEGER REFERENCES lms_matriculas(id);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_lms_matricula
  ON solicitacoes_treinamento(lms_matricula_id)
  WHERE lms_matricula_id IS NOT NULL AND deleted_at IS NULL;
