-- Rollback for 0445_simuladores_matriz_aw139_reconciliacao.sql.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: same read-only production audit (2026-07-27, empresa_id=6)
--   backing 0445; no new source data, this only reverses that migration's own
--   writes by exact prior value.
-- operational_decision: revert fixes 1 and 3 (renames, FAP-link inserts) by
--   the same ID + exact-value scoping as the forward migration; deliberately
--   do not attempt to revert fix 2 (see below) since the schema itself
--   forbids it in place.
-- dry_run_required: run against the same local D1 copy used to dry-run 0445
--   before use; each statement is scoped so it is a no-op if the forward
--   migration was never applied or was only partially applied.
-- rollback_plan_required: this file is itself the rollback plan for 0445;
--   it has no rollback of its own beyond re-running 0445 forward again
--   (both directions are idempotent by construction).
--
-- Fix 3 (FAP link carry-forward) and Fix 1 (renames) are reversible and
-- reverted below, scoped by id + the exact value this migration wrote, so a
-- row already changed by something else since is left untouched.
--
-- Fix 2 (retiring the 7 old duplicate-current rows) is INTENTIONALLY NOT
-- reverted here. modelos_sessao_versionamento has a trigger,
-- trg_modelo_versao_integridade_update, that raises 'versão histórica não
-- pode voltar a vigente; crie versão de reversão auditada' whenever
-- is_current flips 0->1 on an existing row — a historical version can never
-- silently become current again in place. That is deliberate system design
-- from migration 0440, not something this rollback should work around. If
-- fix 2 must be undone, it requires a new, audited entry-point (the same
-- shape as the versioned-import/remediation executors already in this
-- repo), not a raw UPDATE. This file documents that instead of attempting it.

-- Revert fix 3: remove the FAP links this migration inserted. Scoped to
-- exactly the (modelo_id, qualificacao_tipo_id) pairs it created; any link
-- a human added afterwards on these same models is left alone because the
-- pair-list here is exhaustive and explicit, not a wildcard delete.
DELETE FROM modelos_sessao_checks WHERE modelo_id = 105 AND qualificacao_tipo_id IN (84, 77, 79);
DELETE FROM modelos_sessao_checks WHERE modelo_id IN (109, 115, 121) AND qualificacao_tipo_id IN (77, 79, 84, 83);
DELETE FROM modelos_sessao_checks WHERE modelo_id = 142 AND qualificacao_tipo_id IN (76, 78);
DELETE FROM modelos_sessao_checks WHERE modelo_id IN (111, 117, 123) AND qualificacao_tipo_id IN (79, 77);

-- Revert fix 1: restore nome = codigo_canonico exactly where this migration
-- changed it (i.e. only if the current nome still matches what fix 1 wrote).
UPDATE modelos_sessao SET nome = 'A139-I-01/12', updated_at = datetime('now') WHERE id = 94  AND empresa_id = 6 AND nome = 'Familiarização, procedimentos normais e voo visual básico';
UPDATE modelos_sessao SET nome = 'A139-I-02/12', updated_at = datetime('now') WHERE id = 95  AND empresa_id = 6 AND nome = 'Partidas anormais, voo visual e perfis CAT B';
UPDATE modelos_sessao SET nome = 'A139-I-03/12', updated_at = datetime('now') WHERE id = 96  AND empresa_id = 6 AND nome = 'Categoria A — clear area, short field e helideck';
UPDATE modelos_sessao SET nome = 'A139-I-04/12', updated_at = datetime('now') WHERE id = 97  AND empresa_id = 6 AND nome = 'Powerplant, voo monomotor e autorrotações';
UPDATE modelos_sessao SET nome = 'A139-I-05/12', updated_at = datetime('now') WHERE id = 98  AND empresa_id = 6 AND nome = 'Sistema elétrico, barras e integração de displays';
UPDATE modelos_sessao SET nome = 'A139-I-06/12', updated_at = datetime('now') WHERE id = 99  AND empresa_id = 6 AND nome = 'AFCS, air data e reversão para voo manual';
UPDATE modelos_sessao SET nome = 'A139-I-07/12', updated_at = datetime('now') WHERE id = 100 AND empresa_id = 6 AND nome = 'IFR/PBN, FMS, navegação e aproximações';
UPDATE modelos_sessao SET nome = 'A139-I-08/12', updated_at = datetime('now') WHERE id = 101 AND empresa_id = 6 AND nome = 'Rotor, transmissão, hidráulico e rotor de cauda';
UPDATE modelos_sessao SET nome = 'A139-I-09/12', updated_at = datetime('now') WHERE id = 102 AND empresa_id = 6 AND nome = 'Fogo, fumaça, combustível e pouso de emergência';
UPDATE modelos_sessao SET nome = 'A139-I-10/12', updated_at = datetime('now') WHERE id = 103 AND empresa_id = 6 AND nome = 'Operação offshore, helideck, OEI e ditching';
UPDATE modelos_sessao SET nome = 'A139-I-11/12', updated_at = datetime('now') WHERE id = 104 AND empresa_id = 6 AND nome = 'LOFT — treinamento integrado de linha';
UPDATE modelos_sessao SET nome = 'A139-I-12/12', updated_at = datetime('now') WHERE id = 105 AND empresa_id = 6 AND nome = 'LOFT/Check — verificação final de proficiência';

UPDATE modelos_sessao SET nome = 'A139-P-01/04-C1',          updated_at = datetime('now') WHERE id = 106 AND empresa_id = 6 AND nome = 'VFR, emergências e aplicação do QRH';
UPDATE modelos_sessao SET nome = 'A139-P-02/04-C1-OFFSHORE', updated_at = datetime('now') WHERE id = 107 AND empresa_id = 6 AND nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação';
UPDATE modelos_sessao SET nome = 'A139-P-03/04-C1-IFR-LOFT', updated_at = datetime('now') WHERE id = 108 AND empresa_id = 6 AND nome = 'LOFT IFR — treinamento';
UPDATE modelos_sessao SET nome = 'A139-P-04/04-C1-CHECK',    updated_at = datetime('now') WHERE id = 109 AND empresa_id = 6 AND nome = 'LOFT IFR — check';
UPDATE modelos_sessao SET nome = 'A139-S-01/02-C1',          updated_at = datetime('now') WHERE id = 110 AND empresa_id = 6 AND nome = 'LOFT offshore/noturno';
UPDATE modelos_sessao SET nome = 'A139-S-02/02-C1',          updated_at = datetime('now') WHERE id = 111 AND empresa_id = 6 AND nome = 'Consolidação IFR e sistemas';

UPDATE modelos_sessao SET nome = 'A139-P-01/04-C2',          updated_at = datetime('now') WHERE id = 112 AND empresa_id = 6 AND nome = 'VFR, emergências e aplicação do QRH';
UPDATE modelos_sessao SET nome = 'A139-P-02/04-C2-OFFSHORE', updated_at = datetime('now') WHERE id = 113 AND empresa_id = 6 AND nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação';
UPDATE modelos_sessao SET nome = 'A139-P-03/04-C2-IFR-LOFT', updated_at = datetime('now') WHERE id = 114 AND empresa_id = 6 AND nome = 'LOFT IFR — treinamento';
UPDATE modelos_sessao SET nome = 'A139-P-04/04-C2-CHECK',    updated_at = datetime('now') WHERE id = 115 AND empresa_id = 6 AND nome = 'LOFT IFR — check';
UPDATE modelos_sessao SET nome = 'A139-S-01/02-C2',          updated_at = datetime('now') WHERE id = 116 AND empresa_id = 6 AND nome = 'LOFT offshore/noturno';
UPDATE modelos_sessao SET nome = 'A139-S-02/02-C2',          updated_at = datetime('now') WHERE id = 117 AND empresa_id = 6 AND nome = 'Consolidação IFR e sistemas';

UPDATE modelos_sessao SET nome = 'A139-P-01/04-C3',          updated_at = datetime('now') WHERE id = 118 AND empresa_id = 6 AND nome = 'VFR, emergências e aplicação do QRH';
UPDATE modelos_sessao SET nome = 'A139-P-02/04-C3-OFFSHORE', updated_at = datetime('now') WHERE id = 119 AND empresa_id = 6 AND nome = 'Offshore, CAT A, TDP/LDP, ditching e autorrotação';
UPDATE modelos_sessao SET nome = 'A139-P-03/04-C3-IFR-LOFT', updated_at = datetime('now') WHERE id = 120 AND empresa_id = 6 AND nome = 'LOFT IFR — treinamento';
UPDATE modelos_sessao SET nome = 'A139-P-04/04-C3-CHECK',    updated_at = datetime('now') WHERE id = 121 AND empresa_id = 6 AND nome = 'LOFT IFR — check';
UPDATE modelos_sessao SET nome = 'A139-S-01/02-C3',          updated_at = datetime('now') WHERE id = 122 AND empresa_id = 6 AND nome = 'LOFT offshore/noturno';
UPDATE modelos_sessao SET nome = 'A139-S-02/02-C3',          updated_at = datetime('now') WHERE id = 123 AND empresa_id = 6 AND nome = 'Consolidação IFR e sistemas';
