# AirTrust — Shared Session Backend Implementation Report (2026-06-09)

## 1. Model

- Agent: Codex (GPT-5 family)

## 2. Initial Git State

- Workspace root: `<AIRTRUST_ROOT>`
- Initial `HEAD`: `d2de056f49f088d792f4c75fe4eda76819d6fe52`
- `origin/main`: `d2de056f49f088d792f4c75fe4eda76819d6fe52`
- Tracked diff before work: clean
- Untracked docs/artifacts already present in workspace and preserved

## 3. Gate 0 — Historical Migration Ledger

### 3.1 Classification

| Migration | Intended effect | Production finding | Classification |
| --- | --- | --- | --- |
| `0401_add_cor_column_tipos_sessao.sql` | Add `tipos_sessao.cor` | Column already exists in remote schema | `APPLIED_BUT_NOT_IN_LEDGER` |
| `0403_reconcile_wave4_d1_ledger.sql` | Reconcile `0402_harden_empresa_id_wave4.sql` into `d1_migrations` | `0402` already present in ledger and Wave 4 schema predicates already true | `APPLIED_BUT_NOT_IN_LEDGER` |
| `0404_desativar_empresa_teste.sql` | Deactivate company `id=2` | Company `2` already inactive and without active operational rows in the audited scope | `APPLIED_BUT_NOT_IN_LEDGER` |

### 3.2 Remote Evidence

- `wrangler d1 migrations list airtrust-db --env production --remote` initially reported:
  - `0401_add_cor_column_tipos_sessao.sql`
  - `0403_reconcile_wave4_d1_ledger.sql`
  - `0404_desativar_empresa_teste.sql`
- `tipos_sessao.cor` exists in production.
- `0402_harden_empresa_id_wave4.sql` already existed in `d1_migrations`.
- Wave 4 predicates audited as true:
  - `importacoes_log.empresa_id` => `NOT NULL` and no default
  - `qualificacoes_tipos.empresa_id` => `NOT NULL` and no default
  - `sgso_spi_config.empresa_id` => `NOT NULL` and no default
  - `qualificacoes_tipos` has zero active rows with `empresa_id = 1`
  - trigger `trg_qualificacoes_historico_set_tipo` exists
  - view `qualificacoes_historico_v` exists
- `empresas.id = 2` already had:
  - `ativo = 0`
  - `deleted_at = '2025-11-03 01:25:21'`
  - zero active `funcionarios`, `simulador_agendamentos`, `treinamentos_planejados`, and tenant-linked `usuarios`

### 3.3 Reconciliation Performed

- No DDL or data backfill was reapplied.
- A targeted ledger-only reconciliation was executed against production `d1_migrations` with predicate guards matching the audited schema/data state.
- New ledger timestamps recorded:
  - `0401_add_cor_column_tipos_sessao.sql` => `2026-06-09 14:49:04`
  - `0403_reconcile_wave4_d1_ledger.sql` => `2026-06-09 14:49:04`
  - `0404_desativar_empresa_teste.sql` => `2026-06-09 14:49:04`

### 3.4 Gate Result

- `wrangler d1 migrations list airtrust-db --env production --remote` now returns `No migrations to apply!`
- Next regular migration prefix after Gate 0: `0405`

## 4. Current Backend Revalidation

### 4.1 Answers Required Before Patch

1. **How IDs are generated**
   - Runtime creates UUIDs with `crypto.randomUUID()` for `simulador_agendamentos.uuid`, `sessoes_participantes.uuid`, and `fichas_sessao.uuid`.
   - Integer primary keys come from SQLite/D1 autoincrement and are recovered through `result.meta.last_row_id`.

2. **Whether D1 supports the current transactional pattern**
   - The current simulator runtime does **not** wrap session creation/update in a single end-to-end explicit transaction.
   - It uses many standalone `prepare(...).run()` calls plus a few `DB.batch(...)` calls.
   - Operationally, the current write path is therefore multi-step and only partially grouped, not a single atomic unit.

3. **How two fichas already link to the same agendamento**
   - `POST /simuladores/sessoes` loops through every participant and inserts one `fichas_sessao` row per participant with the same `agendamento_slot_id = sessao_id`.
   - This is why the current system already supports two fichas on one physical reservation.

4. **How the participant is related to the ficha**
   - The relationship is by employee identity, not by participant-row identity:
     - `fichas_sessao.colaborador_id_aluno = funcionarios.id`
     - `sessoes_participantes.funcionario_id = funcionarios.id`
   - The runtime correlates participant and ficha through `agendamento_slot_id + colaborador_id_aluno`.

5. **Where `funcao_na_sessao` is recorded**
   - Operational crew role is currently stored in `sessoes_participantes.funcao`.
   - The shared audit concern is confirmed: the runtime session flow does not write segmented PF/PM into `fichas_sessao.funcao_na_sessao`.
   - The only durable role actually used in session orchestration today is the static participant role (`PIC`/`SIC`) in `sessoes_participantes`.

6. **Where `carga_horaria_pf` and `carga_horaria_pm` are written or ignored**
   - Current ficha detail response calculates PF/PM as a fixed 50/50 split from `duracao_minutos`.
   - The audited runtime did not show consistent persistence writes for `carga_horaria_pf` or `carga_horaria_pm` in the standard simulator flow.
   - This confirms the audit: PF/PM is effectively derived/display logic today, not robust segment-based persistence.

7. **Whether a completed ficha changes the entire agendamento status**
   - No automatic parent-session status transition was found in the ficha signing flow.
   - `PUT /simuladores/sessoes/:id` can change the agendamento status and then synchronize planned qualifications for the whole session.
   - Ficha completion itself does not currently flip `simulador_agendamentos.status`.

8. **Whether progression is driven by ficha, participant, or qualification**
   - Planned progression scaffolding is seeded at session/model level through `criarQualificacoesPlanejadas(...)`.
   - The effective completion/progression write is triggered from the ficha flow through `gerarQualificacaoDaFicha(...)`.
   - Therefore:
     - planning is session/model-driven;
     - final advancement is ficha-driven;
     - there is no independent progression engine keyed by `sessoes_participantes.id`.

## 5. Final Architecture

- Parent physical reservation remains `simulador_agendamentos`.
- Shared mode is opt-in via `simulador_agendamentos.modo_compartilhado = 1`.
- Crew membership remains in `sessoes_participantes`.
- Per-participant curricular fulfillment is stored in `simulador_atribuicoes_curriculares`.
- Time slicing is stored in `simulador_agendamento_segmentos`.
- Per-segment PF/PM is stored in `simulador_segmento_participantes`.
- Individual fichas link to curricular ownership through `fichas_sessao.atribuicao_curricular_id`.
- Legacy simple sessions remain untouched and are not auto-converted.

## 6. Tables Created / Extended

- New table: `simulador_atribuicoes_curriculares`
- New table: `simulador_agendamento_segmentos`
- New table: `simulador_segmento_participantes`
- Extended table: `simulador_agendamentos`
  - added `modo_compartilhado INTEGER NOT NULL DEFAULT 0 CHECK (0,1)`
- Extended table: `fichas_sessao`
  - added nullable `atribuicao_curricular_id`

## 7. Constraints and Indexes

- Active unique curricular assignment per `(agendamento_id, participante_id)`.
- Active unique segment order per `(agendamento_id, ordem)`.
- Active unique segment participant per `(segmento_id, participante_id)`.
- Active unique PF/PM role per `(segmento_id, funcao)`.
- Active unique ficha per `atribuicao_curricular_id`.
- Positive duration checks on segments and segment-participant rows.
- Role restriction on `simulador_segmento_participantes.funcao IN ('PF','PM')`.
- New secondary indexes added for `empresa_id`, `agendamento_id`, `segmento_id`, `participante_id`, and `atribuicao_curricular_id` access paths.

## 8. API

- Added `POST /sessoes/compartilhada`
- Added `GET /sessoes/compartilhada/:id`
- Added `PUT /sessoes/compartilhada/:id`
- Added `POST /sessoes/compartilhada/:id/atribuicoes/:atribuicaoId/cancelar`
- Mounted shared-session router ahead of the legacy simulator session routes.
- All new endpoints are guarded by `SIMULATOR_SHARED_SESSIONS_ENABLED === 'true'`.

## 9. Conflicts

- Parent shared reservation reuses the existing external conflict rules:
  - simulator
  - instructor
  - participant
- Internal segments do not create separate `simulador_agendamentos` rows and therefore do not create false external conflicts.
- Cross-tenant ownership is enforced for:
  - participants
  - instructor
  - simulator
  - planned training ids
  - session model ids

## 10. Hours

- Shared-hour calculation is centralized in pure logic (`simuladores-shared-session-logic.ts`).
- For the two-pilot / two-training scenario:
  - each pilot gets `120` total minutes
  - each pilot gets `60` PF + `60` PM
  - each pilot gets curricular minutes only on the segment assigned to that pilot’s own training
- For the support-participant scenario:
  - support participant receives operational hours and PF/PM role accounting
  - support participant receives `0` curricular minutes

## 11. Progression

- Shared create/update still seeds planned qualification scaffolding through the existing helper when the selected model requires qualification generation.
- Final advancement remains ficha-driven through the existing ficha completion path.
- The ficha qualification lookup now prefers `fichas_sessao.atribuicao_curricular_id -> simulador_atribuicoes_curriculares.modelo_sessao_id`, which prevents shared-session progress from inheriting the wrong model when two trainings share one reservation.

## 12. Support Participant Without Ficha

- Support participant is represented in `sessoes_participantes`.
- Support participant can appear in `simulador_segmento_participantes`.
- Support participant does not receive `simulador_atribuicoes_curriculares`.
- Support participant cannot request `gera_ficha = true`.
- Support participant does not progress training and does not receive planned/shared ficha linkage.

## 13. Cancellation and Edit Rules

- Full legacy `DELETE /sessoes/:id` now also soft-cleans additive shared-session rows when present, without changing the legacy success contract.
- Shared assignment cancellation:
  - blocks when linked ficha is final (`APROVADO`, `NAO_APROVADO`, `CONCLUIDA`)
  - cancels only the selected curricular assignment
  - nulls the shared-segment curricular linkage
  - soft-deletes only the linked ficha
  - soft-deletes only planned qualifications for that participant/session
- Shared session edit:
  - blocks when any linked ficha is final
  - now rebuilds the shared structure through a single D1 `batch(...)` transaction for the core shared rows
  - preserves the same parent reservation id

## 14. Feature Flag

- Added `SIMULATOR_SHARED_SESSIONS_ENABLED?: string` to the worker env typing.
- Feature is server-side only.
- Default production posture remains disabled unless explicitly enabled after this macro-lot.

## 15. Legacy Tests

- New characterization tests added specifically for legacy simple simulator sessions:
  - create simple session
  - preserve legacy simulator conflict response
  - preserve legacy soft-delete flow even with shared-session cleanup hooks
- Existing preexisting suites continue covering broader simulator/session/ficha behavior outside the new additive scope.

## 16. New Backend Tests

- Pure logic tests cover:
  - two pilots / two trainings
  - one curricular participant + one support participant
  - overlapping segment rejection
  - support participant blocked from `gera_ficha=true`
- Route contract tests cover:
  - feature flag disabled
  - external simulator conflict rejection
  - shared create path using transactional `DB.batch(...)`
- Migration schema test covers:
  - tables
  - new columns
  - indexes
  - no legacy conversion
  - `integrity_check`
  - `pragma_foreign_key_check()`

## 17. Replay

- Production copy used for replay:
  - `artifacts/db-backups/airtrust-db-pre-shared-sessions-backend-20260609.sql`
  - size: `105267249` bytes
- Replay target:
  - temporary local SQLite file under `/tmp/airtrust-shared-replay-ReqQWB/replay.sqlite`
- Before migration:
  - `PRAGMA integrity_check` => `ok`
  - `pragma_foreign_key_check()` count => `525`
  - `simulador_agendamentos` => `101`
  - `sessoes_participantes` => `379`
  - `fichas_sessao` => `209`
- After applying `0405_add_shared_session_backend.sql` locally:
  - `PRAGMA integrity_check` => `ok`
  - `pragma_foreign_key_check()` count => `525` (stable; no new FK residue introduced)
  - `simulador_agendamentos` => `101`
  - `sessoes_participantes` => `379`
  - `fichas_sessao` => `209`
  - `modo_compartilhado != 0` on legacy rows => `0`
  - new shared tables row counts => `0`
  - `fichas_sessao.atribuicao_curricular_id IS NOT NULL` => `0`
- Sample preexisting FK residue remains concentrated in legacy `_backup_qh_tmp -> funcionarios_backup`, confirming the replay did not create a new issue class.

## 18. Backup

- Remote backup/export executed successfully:
  - `env -u CLOUDFLARE_API_TOKEN npx wrangler d1 export airtrust-db --env production --remote --output artifacts/db-backups/airtrust-db-pre-shared-sessions-backend-20260609.sql`
- Result:
  - file created successfully
  - plausible size (`105267249` bytes)
  - path is covered by `.gitignore` (`artifacts/db-backups/`)

## 19. Commits

- Commit 1 completed:
  - `f4fbe8c9`
  - message: `docs(simuladores): document shared session architecture`
- Feature commit was pending at the time this report section was last updated.

## 20. Migration

- New migration file: `worker-airtrust/migrations/0405_add_shared_session_backend.sql`
- Gate 0 historical ledger was reconciled first.
- `0405` remained unapplied to production at the time this report section was last updated.

## 21. Deploy / Health

- Worker deploy and post-deploy `version` / `health` checks were pending at the time this report section was last updated.

## 22. Validation Summary

- `npx tsc --noEmit` => `0`
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` => `0`
- `npm run lint` => `0`
- `npm run test:run` => `0`
  - `72 passed | 3 skipped`
  - `719 passed`
- `npm run test:worker` => `0`
  - `171 passed`
  - `1147 passed`
- `npm run build` => `0`

## 23. Risks

- Core shared create/edit/cancel writes now batch the additive shared rows transactionally, which materially reduces partial-write risk versus the first draft.
- Planned qualification creation still reuses the existing helper after the core shared batch commits; this keeps business rules aligned with the current system but means qualification seeding is not yet folded into the same atomic batch as the core shared rows.
- `PUT /sessoes/compartilhada/:id` is better protected than the first draft, but it still deserves production observation once the feature is eventually enabled.

## 24. Rollback and Macro-lote B State

- Rollback posture for Macro-lote A:
  - feature can remain disabled in production even after schema apply
  - schema is additive and does not auto-convert legacy rows
  - pre-apply production export exists for restore/replay support
- Ready state for Macro-lote B:
  - backend shared-session schema exists
  - backend shared-session endpoints exist behind server flag
  - legacy simple sessions remain compatible
  - frontend exposure is intentionally still deferred
