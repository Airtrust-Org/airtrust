-- F4-03 / 0435 deterministic six-row rollback.
-- source_reference: issue #414 deterministic repair target set and immutable pre-incident certificate evidence.
-- operational_decision: reverse only the exact six repaired expiry values if an explicitly authorized rollback is required.
-- dry_run_required: verify all six rows currently equal the repaired target values before executing this file.
-- rollback_plan_required: primary recovery is the D1 Time Travel point captured immediately before apply; this SQL is a reviewed compensating fallback only.
--
-- This file is NOT allowlisted by scripts/run-production-db-script.sh and is not executed automatically.

UPDATE qualificacoes_historico
SET data_vencimento = CASE id
  WHEN 4595 THEN '2025-02-16'
  WHEN 4610 THEN '2024-04-06'
  WHEN 4628 THEN '2023-11-03'
  WHEN 4632 THEN '2025-01-04'
  WHEN 4634 THEN '2024-03-11'
  WHEN 4670 THEN '2023-10-21'
  ELSE data_vencimento
END
WHERE empresa_id = 6
  AND deleted_at IS NULL
  AND origem_tipo = 'MANUAL'
  AND lms_matricula_id IS NULL
  AND (
    (id = 4595 AND qualificacao_id = 130 AND data_conclusao = '2023-02-16' AND data_vencimento = '2026-02-16') OR
    (id = 4610 AND qualificacao_id = 141 AND data_conclusao = '2022-04-06' AND data_vencimento = '2025-04-06') OR
    (id = 4628 AND qualificacao_id = 23  AND data_conclusao = '2021-11-03' AND data_vencimento = '2024-11-03') OR
    (id = 4632 AND qualificacao_id = 23  AND data_conclusao = '2023-01-04' AND data_vencimento = '2026-01-04') OR
    (id = 4634 AND qualificacao_id = 23  AND data_conclusao = '2022-03-11' AND data_vencimento = '2025-03-11') OR
    (id = 4670 AND qualificacao_id = 23  AND data_conclusao = '2021-10-21' AND data_vencimento = '2024-10-21')
  );
