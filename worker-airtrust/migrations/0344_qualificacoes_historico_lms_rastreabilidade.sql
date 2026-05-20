-- Migration: 0344_qualificacoes_historico_lms_rastreabilidade
-- Bloco 3.1 e 3.2: Adiciona rastreabilidade bidirecional entre qualificações e LMS
-- lms_matricula_id: FK para a matrícula LMS que gerou esta qualificação
-- origem_tipo: enum estruturado que substitui inferência por texto livre em 'observacoes'

ALTER TABLE qualificacoes_historico
ADD COLUMN lms_matricula_id INTEGER REFERENCES lms_matriculas(id);

ALTER TABLE qualificacoes_historico
ADD COLUMN origem_tipo TEXT
  CHECK(origem_tipo IS NULL OR origem_tipo IN ('LMS', 'PRESENCIAL', 'SIMULADOR', 'IMPORTADO_EDAPP', 'MANUAL'));

CREATE INDEX IF NOT EXISTS idx_qual_historico_lms_matricula
  ON qualificacoes_historico(lms_matricula_id)
  WHERE lms_matricula_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qual_historico_origem_tipo
  ON qualificacoes_historico(origem_tipo, empresa_id)
  WHERE deleted_at IS NULL;

-- Backfill: registros com tipo = 'LMS' recebem origem_tipo = 'LMS'
UPDATE qualificacoes_historico
SET origem_tipo = 'LMS'
WHERE tipo = 'LMS' AND origem_tipo IS NULL AND deleted_at IS NULL;

-- Backfill: registros com sessao_id preenchido recebem origem_tipo = 'SIMULADOR'
UPDATE qualificacoes_historico
SET origem_tipo = 'SIMULADOR'
WHERE sessao_id IS NOT NULL AND origem_tipo IS NULL AND deleted_at IS NULL;
