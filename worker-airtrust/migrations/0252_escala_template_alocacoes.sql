-- Migration 0252: escala_template_alocacoes
-- Linhas individuais de template (substitui pic_id/sic_id acoplados no template pai).
-- Permite templates com múltiplos slots independentes: PIC1, SIC1, SIC-reserva, Flex.
-- ROLLBACK EMERGENCIAL:
--   DROP TABLE IF EXISTS escala_template_alocacoes;
--   DROP INDEX IF EXISTS idx_template_alocacoes_template;
--   ALTER TABLE escalas_templates_tripulacao DROP COLUMN migrado_para_v2;  -- executar apenas se suportado no ambiente

CREATE TABLE IF NOT EXISTS escala_template_alocacoes (
  id              TEXT    PRIMARY KEY,
  template_id     TEXT    NOT NULL REFERENCES escalas_templates_tripulacao(id) ON DELETE CASCADE,
  funcao          TEXT    NOT NULL CHECK (funcao IN ('PIC','SIC','PIC_CHK','SIC_CHK','INSTRUTOR','FLEX')),
  funcionario_id  TEXT    REFERENCES funcionarios(id),  -- null = slot vazio (a preencher)
  padrao_escala_id TEXT   REFERENCES padroes_escala(id),
  ordem           INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_template_alocacoes_template
  ON escala_template_alocacoes(template_id)
  WHERE deleted_at IS NULL;

-- Sinalizar que o template foi migrado para o novo modelo
ALTER TABLE escalas_templates_tripulacao
  ADD COLUMN migrado_para_v2 INTEGER NOT NULL DEFAULT 0;
