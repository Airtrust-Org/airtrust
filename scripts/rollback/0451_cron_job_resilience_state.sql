-- Rollback controlado da migration 0451.
-- ATENÇÃO: destrutivo para checkpoints, leases, itens pendentes e histórico de runs.
-- Executar somente após desativar o scheduler resiliente e confirmar ausência de jobs ativos.

DROP INDEX IF EXISTS idx_cron_job_runs_outcome;
DROP INDEX IF EXISTS idx_cron_job_runs_lookup;
DROP TABLE IF EXISTS cron_job_runs;

DROP INDEX IF EXISTS idx_cron_job_items_pending;
DROP TABLE IF EXISTS cron_job_items;

DROP INDEX IF EXISTS idx_cron_job_state_last_success;
DROP INDEX IF EXISTS idx_cron_job_state_lease_expiry;
DROP TABLE IF EXISTS cron_job_state;
