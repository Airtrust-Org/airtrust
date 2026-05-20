-- ================================================================
-- Migration 0317: Split de carga horaria + tipo_treinamento no historico
-- Data: 2026-03-31
-- ================================================================

ALTER TABLE qualificacoes_tipos
  ADD COLUMN carga_horaria_inicial REAL CHECK(carga_horaria_inicial IS NULL OR carga_horaria_inicial > 0);

ALTER TABLE qualificacoes_tipos
  ADD COLUMN carga_horaria_recorrente REAL CHECK(carga_horaria_recorrente IS NULL OR carga_horaria_recorrente > 0);

UPDATE qualificacoes_tipos
SET carga_horaria_inicial = COALESCE(carga_horaria_inicial, carga_horaria),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND carga_horaria IS NOT NULL;

ALTER TABLE qualificacoes_historico
  ADD COLUMN tipo_treinamento TEXT CHECK(tipo_treinamento IN ('INICIAL', 'RECORRENTE', 'UPGRADE', 'ESPECIFICO'));

UPDATE qualificacoes_historico
SET tipo_treinamento = 'RECORRENTE',
    updated_at = datetime('now')
WHERE tipo_treinamento IS NULL
  AND deleted_at IS NULL;

UPDATE qualificacoes_historico
SET carga_horaria = COALESCE(
      (SELECT qt.carga_horaria_recorrente FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id),
      carga_horaria,
      (SELECT qt.carga_horaria FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id),
      (SELECT qt.carga_horaria_inicial FROM qualificacoes_tipos qt WHERE qt.id = qualificacoes_historico.qualificacao_id)
    ),
    updated_at = datetime('now')
WHERE deleted_at IS NULL;