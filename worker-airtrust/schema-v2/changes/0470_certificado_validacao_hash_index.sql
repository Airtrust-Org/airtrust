-- Production Schema V2 change for 0470 indexed certificate validation hashes.
-- Additive-only schema required to replace the public O(N) certificate scan.
--
-- source_reference:
--   worker-airtrust/migrations/0470_certificado_validacao_hash_index.sql
-- operational_decision:
--   Add only the nullable validation-hash column and lookup index. Existing
--   certificate tokens remain unchanged. Historical hash backfill is governed
--   separately and must be verified before removing compatibility scanning.
-- dry_run_required:
--   Official Schema V2 workflow validates hashes, baseline, current schema
--   contract and unapplied change before remote execution.
-- rollback_plan_required:
--   Capture D1 Time Travel recovery point before apply. Runtime can ignore the
--   additive column; destructive removal is a separate governed action.

ALTER TABLE qualificacoes_historico
  ADD COLUMN validacao_hash TEXT
  CHECK (validacao_hash IS NULL OR (length(validacao_hash) = 16 AND validacao_hash = upper(validacao_hash)));

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_validacao_hash
  ON qualificacoes_historico (validacao_hash)
  WHERE validacao_hash IS NOT NULL AND deleted_at IS NULL;
