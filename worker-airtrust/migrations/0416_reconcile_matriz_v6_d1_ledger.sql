-- Reconcile production d1_migrations after Matriz V6.1 Costa do Sol
-- (2026-07-04) applied migrations 0413 and 0414 via direct d1 execute --file
-- to work around the local-only design of the apply script.
--
-- Safety model:
--   - Only records 0413 if NOTECHS catalog data is already present.
--   - Only records 0414 if referencias_json column already exists on manobras.
--   - Does NOT record 0412 (Qualificações — bloqueada, não aplicada).
--   - Does NOT record 0408–0411 (fora de escopo, não aplicadas).
--   - Idempotent: skips any entry already in the ledger.
--   - Pure ledger metadata — no DDL, no DML on domain tables.
--   - Self-registers 0416: unlike 0398/0400/0403 (applied via wrangler runner
--     which auto-registers), 0416 will be applied via d1 execute --file and
--     must self-register to avoid shifting the reconciliation debt forward.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference:
--     Matriz V6.1 Costa do Sol apply (2026-07-04) — migrations 0413 e 0414
--     aplicadas via d1 execute --file fora do wrapper transacional do
--     wrangler. Documentado em docs/ops/matriz-v6-production-apply-20260704.md.
--     PRs #243 (safety pack), #247 (S76 endings), #248 (SK76 semestral endings).
--   operational_decision:
--     Registra entradas ausentes em d1_migrations para migrations já
--     confirmadamente aplicadas em produção (schema verificado via
--     pragma_table_info / EXISTS) + auto-registra 0416. Não executa DDL
--     nem DML de domínio. Não registra 0412 (bloqueada) nem 0408–0411.
--   dry_run_required:
--     Antes de aplicar em produção:
--       1. Rodar em banco local/staging com as migrations 0413/0414 já
--          aplicadas e confirmar que 3 linhas são inseridas (0413, 0414, 0416).
--       2. Rodar 2x e confirmar 0 linhas na segunda execução (idempotente).
--       3. Confirmar que 0412 NÃO aparece no ledger após a execução.
--   rollback_plan_required:
--     Rollback é DELETE direto das entradas inseridas, sem perda de dados de
--     domínio: `DELETE FROM d1_migrations WHERE name IN
--     ('0413_notechs_categoria_itens.sql','0414_add_manobras_referencias_json.sql',
--     '0416_reconcile_matriz_v6_d1_ledger.sql') AND applied_at = '2026-07-04';`

-- ============================================================================
-- 0413: NOTECHS catalog (15 items, categoria NOTECHS)
-- ============================================================================
INSERT INTO d1_migrations (name, applied_at)
SELECT '0413_notechs_categoria_itens.sql', '2026-07-04'
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0413_notechs_categoria_itens.sql'
)
AND EXISTS (
  SELECT 1 FROM manobras_categorias WHERE nome = 'NOTECHS'
)
AND EXISTS (
  SELECT 1 FROM manobras WHERE codigo = 'NOT-COM-01' AND empresa_id IS NOT NULL
);

-- ============================================================================
-- 0414: referencias_json column on manobras
-- ============================================================================
INSERT INTO d1_migrations (name, applied_at)
SELECT '0414_add_manobras_referencias_json.sql', '2026-07-04'
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0414_add_manobras_referencias_json.sql'
)
AND EXISTS (
  SELECT 1 FROM pragma_table_info('manobras')
  WHERE name = 'referencias_json'
);

-- ============================================================================
-- 0416: reconciliation migration itself (self-register)
-- ============================================================================
INSERT INTO d1_migrations (name, applied_at)
SELECT '0416_reconcile_matriz_v6_d1_ledger.sql', '2026-07-04'
WHERE NOT EXISTS (
  SELECT 1 FROM d1_migrations WHERE name = '0416_reconcile_matriz_v6_d1_ledger.sql'
);

-- ============================================================================
-- Explicitly NOT recorded: 0412 (bloqueada — toca Qualificações, não aplicada)
-- ============================================================================
-- 0412_qualificacoes_classificacao.sql is intentionally absent from this
-- reconciliation. It was blocked during the Matriz V6.1 apply (2026-07-04)
-- because it touches Qualificações (PR #216) and requires separate explicit
-- authorization. The ledger correctly does NOT contain 0412, and this
-- migration does NOT change that.
