-- MIGRAÇÃO: escala_tripulacoes → escala_alocacoes
-- Executar apenas se escala_alocacoes estiver vazia
-- 4 slots por aeronave por escala: Q1-PIC, Q1-SIC, Q2-PIC, Q2-SIC

-- Migrar PIC de cada tripulação legada
INSERT OR IGNORE INTO escala_alocacoes
  (id, escala_id, funcionario_id, aeronave_id, funcao,
   quinzena_id, data_inicio, data_fim,
   status, tripulacao_legado_id, created_by, created_at, updated_at)
SELECT
  lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) ||
  '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(8))),
  et.escala_id,
  et.pic_id,
  a.id,
  'PIC',
  (SELECT q.id FROM escalas_quinzenas q
   WHERE q.deleted_at IS NULL
     AND q.data_inicio <= et.data_inicio
     AND q.data_fim    >= et.data_inicio
   ORDER BY q.data_inicio
   LIMIT 1),
  et.data_inicio,
  COALESCE(
    (SELECT q.data_fim FROM escalas_quinzenas q
     WHERE q.deleted_at IS NULL
       AND q.data_inicio <= et.data_inicio
       AND q.data_fim    >= et.data_inicio
     ORDER BY q.data_inicio LIMIT 1),
    et.data_fim
  ),
  'planejado',
  et.id,
  'migration-0254',
  et.created_at,
  datetime('now')
FROM escala_tripulacoes et
JOIN aeronaves a ON UPPER(TRIM(a.prefixo)) = UPPER(TRIM(
  CASE
    WHEN INSTR(TRIM(et.aeronave), ' ') > 0
      THEN SUBSTR(TRIM(et.aeronave), 1, INSTR(TRIM(et.aeronave), ' ') - 1)
    ELSE TRIM(et.aeronave)
  END
))
WHERE et.deleted_at IS NULL
  AND et.pic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM escala_alocacoes ea2
    WHERE ea2.tripulacao_legado_id = et.id
      AND ea2.funcao = 'PIC'
      AND ea2.deleted_at IS NULL
  );

-- Migrar SIC de cada tripulação legada
INSERT OR IGNORE INTO escala_alocacoes
  (id, escala_id, funcionario_id, aeronave_id, funcao,
   quinzena_id, data_inicio, data_fim,
   status, tripulacao_legado_id, created_by, created_at, updated_at)
SELECT
  lower(hex(randomblob(8))) || '-' || lower(hex(randomblob(4))) ||
  '-' || lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(8))),
  et.escala_id,
  et.sic_id,
  a.id,
  'SIC',
  (SELECT q.id FROM escalas_quinzenas q
   WHERE q.deleted_at IS NULL
     AND q.data_inicio <= et.data_inicio
     AND q.data_fim    >= et.data_inicio
   ORDER BY q.data_inicio
   LIMIT 1),
  et.data_inicio,
  COALESCE(
    (SELECT q.data_fim FROM escalas_quinzenas q
     WHERE q.deleted_at IS NULL
       AND q.data_inicio <= et.data_inicio
       AND q.data_fim    >= et.data_inicio
     ORDER BY q.data_inicio LIMIT 1),
    et.data_fim
  ),
  'planejado',
  et.id,
  'migration-0254',
  et.created_at,
  datetime('now')
FROM escala_tripulacoes et
JOIN aeronaves a ON UPPER(TRIM(a.prefixo)) = UPPER(TRIM(
  CASE
    WHEN INSTR(TRIM(et.aeronave), ' ') > 0
      THEN SUBSTR(TRIM(et.aeronave), 1, INSTR(TRIM(et.aeronave), ' ') - 1)
    ELSE TRIM(et.aeronave)
  END
))
WHERE et.deleted_at IS NULL
  AND et.sic_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM escala_alocacoes ea2
    WHERE ea2.tripulacao_legado_id = et.id
      AND ea2.funcao = 'SIC'
      AND ea2.deleted_at IS NULL
  );

-- Verificar resultado
SELECT funcao, COUNT(*) as total FROM escala_alocacoes
WHERE deleted_at IS NULL GROUP BY funcao;
