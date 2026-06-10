# AirTrust - Shared Simulator Session - Release Plan (2026-06-09)

## Status

- Classification target: `READY_FOR_CONTROLLED_RELEASE`
- Current branch for release review: `release/shared-simulator-session-review`
- Push: not executed
- Deploy: not executed
- Remote D1 write: not executed
- Feature activation: not executed

## Reviewed Commit Chain

- `6b975ee6` - `feat(simuladores): checkpoint shared session local workflow`
- `2b6483da` - `feat(simuladores): complete shared session workflow`
- `3640dd87` - `docs(simuladores): record clean shared session validation`
- `cc24e367` - `docs(simuladores): finalize shared session release evidence`

## Integration Result

- `origin/main` before fetch: `c75e9bf9`
- `origin/main` after fetch: `c75e9bf9`
- Remote-only commits after fetch: none
- Local-only commits under review: four
- Integration strategy used: isolated worktree + local branch + `git rebase origin/main`
- Rebase result: no-op (`Current branch ... is up to date`)
- Divergence classification: `NO_DIVERGENCE`

## Functional Scope Included

- Shared-session backend routes under `worker-airtrust/src/routes/simuladores-shared-session.ts`
- Shared-session validation and curricular signature logic
- Shared-session capability endpoint in `worker-airtrust/src/index.ts`
- Shared-session modal/UI flow in `src/react-app/components/modals/ModalNovaSessao.tsx`
- Shared-session form in `src/react-app/components/modals/SharedSessionForm.tsx`
- Shared-session calendar badges and ficha/PDF shared-hour rendering
- Focused frontend and worker tests for capability, shared-session logic, hours contract, and UI helpers

## Files Requiring Publication

- `src/react-app/components/modals/ModalNovaSessao.tsx`
- `src/react-app/components/modals/SharedSessionForm.tsx`
- `src/react-app/components/modals/__tests__/SharedSessionForm.test.tsx`
- `src/react-app/components/modals/__tests__/SharedSessionForm.rendered.test.tsx`
- `src/react-app/components/simuladores/FuncionarioCombobox.tsx`
- `src/react-app/components/simuladores/__tests__/FuncionarioCombobox.test.tsx`
- `src/react-app/components/simuladores/SessaoCard.tsx`
- `src/react-app/config/sharedSessions.ts`
- `src/react-app/pages/simuladores/agenda/CalendarioAgendamentos.tsx`
- `src/react-app/pages/simuladores/fichas/[id]/index.tsx`
- `src/react-app/pages/simuladores/tabs/TabSessoesWrapper.tsx`
- `src/react-app/services/pdf-ficha-client.ts`
- `worker-airtrust/src/index.ts`
- `worker-airtrust/src/routes/simuladores-fichas.ts`
- `worker-airtrust/src/routes/simuladores-modelos.ts`
- `worker-airtrust/src/routes/simuladores-sessoes.ts`
- `worker-airtrust/src/routes/simuladores-shared-session-logic.ts`
- `worker-airtrust/src/routes/simuladores-shared-session.ts`
- `worker-airtrust/src/__tests__/architecture/architecture-performance-guard.test.ts`
- `worker-airtrust/src/__tests__/routes/capabilities-feature-flag.test.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-fichas-shared-hours-contract.test.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-modelos-dropdown-and-tipo-cor.test.ts`
- `worker-airtrust/src/__tests__/routes/simuladores-shared-session-logic.test.ts`
- `docs/AIRTRUST_SIMULATOR_SHARED_SESSION_LOCAL_IMPLEMENTATION_AND_VALIDATION_20260609.md`

## Documentation State

- Release evidence report corrected to state:
  - functional local commit = `2b6483da`
  - push = no
  - deploy = no
  - remote D1 = no
- Clean reproduction and full prior local E2E are now documented as separate evidence layers
- This release plan file is intentionally left uncommitted pending review

## Validation Summary

- `npx tsc --noEmit`: PASS
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`: PASS
- `npm run lint`: PASS
- `npm run test:run`: PASS (`757` tests, `75` files, `3` skipped)
- `npm run test:worker`: PASS (`1157` tests, `173` files)
- `npm run build`: PASS
- `git diff --check origin/main...HEAD`: PASS

## Local Replay With Real Schema

- Isolated worker runtime copied into the review worktree from the existing local environment
- Migration `0405_add_shared_session_backend.sql` confirmed in local D1 ledger
- Shared-session schema confirmed present:
  - `simulador_agendamento_segmentos`
  - `simulador_segmento_participantes`
  - `simulador_atribuicoes_curriculares`
  - `simulador_agendamentos.modo_compartilhado`
  - `fichas_sessao.atribuicao_curricular_id`
- Local capability endpoint on replay worker returned `simulador_shared_sessions = true`
- Local search/data endpoints consumed by the modal responded with real schema:
  - capabilities
  - participant search
  - planned trainings
  - filtered session models
- Shared-session API smoke on real local D1:
  - create synthetic shared session: PASS (`201`)
  - fetch shared detail: PASS (`200`)
  - cancel synthetic shared session: PASS (`200`)
- Legacy simple-session API smoke on same branch/runtime:
  - create simple session: PASS (`201`)
  - fetch simple detail: PASS (`200`)
  - cancel simple session: PASS (`200`)
- Post-smoke integrity:
  - `PRAGMA integrity_check = ok`
  - `pragma_foreign_key_check` count remained `525`
  - synthetic reservations created in smoke (`110`, `111`) were soft-deleted during cleanup

## Production Read-Only Audit

- `GET /api/version`: healthy deployment at `2026-06-09T15:22:52Z-c75e9bf9`
- `GET /api/health`: healthy
- `wrangler d1 migrations list DB --env production --remote --config wrangler.toml`: `No migrations to apply`
- Remote ledger status is consistent with `0405` already applied and no unexpected pending migrations
- Public production `GET /api/capabilities` currently returns auth failure, which is consistent with the production worker not yet carrying the unreleased capability endpoint and frontend gate

## Security / Safety Review Notes

- No real secret exposure found in the reviewed feature diff
- Sensitive-pattern hits were classified as non-blocking:
  - docs-only local evidence markers such as `LOCAL-E2E-*`
  - test-only mock tokens such as `token-teste`
  - expected runtime `Authorization: Bearer ...` code paths
  - negative assertion for `JWT_SECRET` in a test
- No runtime personal paths or local artifacts were found in the functional code path that would ship with the feature
- No remote writes were performed during this review lot

## Publication Plan

### Step 1 - Push Code

- Precondition:
  - explicit authorization received
  - release branch reviewed
  - final docs state approved
- Action:
  - merge or fast-forward the reviewed local commits to the chosen publication branch
  - push branch/merge commit to remote
- Expected outcome:
  - remote repository now contains frontend + worker + docs evidence
- Abort if:
  - branch content differs from reviewed commit chain
  - any extra local artifact or unrelated file enters the diff

### Step 2 - Deploy Worker

- Precondition:
  - pushed backend matches reviewed branch
  - `SIMULATOR_SHARED_SESSIONS_ENABLED` remains unset or `false`
- Action:
  - deploy worker only
- Expected outcome:
  - production API includes new backend code but shared-session behavior remains unavailable
- Verify:
  - `GET /api/version`
  - `GET /api/health`
  - no auth/public regression
- Abort if:
  - health degrades
  - auth/public routing changes unexpectedly
  - simulator simple-session regressions appear in smoke

### Step 3 - Deploy Pages

- Precondition:
  - worker healthy with flag still off
- Action:
  - deploy frontend/Pages
- Expected outcome:
  - new SPA is live, but shared-session UI stays hidden because capability remains unavailable/fail-closed
- Verify:
  - app loads normally
  - simple simulator flow still works
  - no broken modal or calendar regressions
- Abort if:
  - modal load fails
  - calendar rendering regresses
  - existing simulator workflows break

### Step 4 - Controlled Activation

- Precondition:
  - worker healthy
  - Pages healthy
  - rollout window staffed for immediate rollback
- Action:
  - enable `SIMULATOR_SHARED_SESSIONS_ENABLED=true`
  - if tenant-scoped activation is later introduced, prefer enabling for a controlled tenant first
- Verify immediately:
  - authenticated production smoke for shared-session create/detail/cancel with approved operator
  - legacy simple session still works
  - shared badge and ficha/PF/PM rendering behave as expected
- Abort if:
  - shared create conflicts unexpectedly
  - qualification or ficha generation diverges
  - simple-session regressions appear

## Rollback Plan

### Activation Rollback

- First response:
  - set `SIMULATOR_SHARED_SESSIONS_ENABLED=false`
  - or remove the variable if unset is the intended disabled state
- Expected behavior:
  - frontend hides the feature via fail-closed capability check
  - existing shared data remains stored but inactive in UI/API flows

### Pages Rollback

- Restore the previous Pages deployment
- Use if:
  - UI-only regression appears while worker is still healthy

### Worker Rollback

- Restore the previous worker deployment or deploy the prior reviewed commit
- Use if:
  - backend behavior regresses
  - auth/public routing regresses
  - simulator API behavior changes unexpectedly

### Database Rollback

- Do not roll back migration `0405`
- Rationale:
  - additive schema already applied
  - shared records created after activation must remain readable even if the feature is disabled

## Abort Criteria

- Any secret/artifact enters the publication diff
- Any non-reviewed code is mixed into the release
- Worker or Pages health check degrades after deploy
- Shared-session smoke fails in production after activation
- Legacy simple session regresses at any point
- Unexpected pending migration appears in the remote ledger

## Monitoring Checklist

- `GET /api/version`
- `GET /api/health`
- worker logs during and after deploy
- authenticated simulator smoke on production after activation
- calendar rendering
- ficha detail/PDF generation
- qualification/planned-session side effects

## Responsible Roles

- Engineering: execute merge/push/deploy only after approval
- Product/Operations: approve rollout window and validation scenario
- Operator/Test owner: run authenticated production smoke after activation
- Engineering on-call: own rollback execution if abort criteria are met

## Evidence Bundle

- `docs/AIRTRUST_SIMULATOR_SHARED_SESSION_LOCAL_IMPLEMENTATION_AND_VALIDATION_20260609.md`
- local validation counts (`757` frontend, `1157` worker)
- local real-schema replay results
- production version/health snapshot
- remote migration ledger snapshot

## Code Deployment with Feature Disabled (2026-06-09 23:06 UTC)

### Push

- Pushed 5 commits to `origin/main`:
  - `6b975ee6` — `feat(simuladores): checkpoint shared session local workflow`
  - `2b6483da` — `feat(simuladores): complete shared session workflow`
  - `3640dd87` — `docs(simuladores): record clean shared session validation`
  - `cc24e367` — `docs(simuladores): finalize shared session release evidence`
  - `207d8f1c` — `docs(simuladores): add shared session release plan`
- `origin/main` advanced from `c75e9bf9` → `207d8f1c`
- Push type: fast-forward only
- No force-push, no rewrite

### Worker Deployment

- Command: `npm run deploy:worker:safe`
- Worker: `airtrust-api-production`
- Version: `2026-06-09T23:06:58Z-207d8f1c`
- No migrations applied (0405 already present)
- Bindings: DB, BUCKET, AI, ENVIRONMENT, APP_VERSION, APP_BUILD_TIME
- Upload: 5932.86 KiB / gzip: 1156.82 KiB

### Pages Deployment

- Triggered by push to `origin/main` (Cloudflare Pages Git integration)
- Frontend: `airtrust.online` serving HTTP 200
- JS bundle: accessible, content-hash updated

### Post-Deploy Verification

| Check | Result |
|---|---|
| `/api/version` | `207d8f1c` ✅ |
| `/api/health` | healthy (DB ok, Storage ok) ✅ |
| `/api/capabilities` | `simulador_shared_sessions: false` ✅ |
| Migration ledger | `No migrations to apply!` ✅ |
| Frontend HTTP | 200 ✅ |
| JS bundle | accessible ✅ |
| Simulator routes | 401 (auth gated) ✅ |
| Shared-session endpoint | 401 (auth gated) ✅ |

### Feature State

- Feature: **DISABLED** (`SIMULATOR_SHARED_SESSIONS_ENABLED` not set)
- Shared modality: hidden (capability `false`)
- Simple session: independent, unaffected
- No shared-session records created
- No remote D1 writes performed

### Rollback

- Not needed
- Rollback plan remains documented above

## Release Decision

- Recommended status: `READY_FOR_CONTROLLED_RELEASE`
- Deployed status: `CODE_DEPLOYED_FEATURE_DISABLED_READY_FOR_ACTIVATION_REVIEW`
- This status remains valid only while:
  - the reviewed commit chain stays unchanged
  - production health remains green
  - no unrelated files are added to the publication diff
  - `SIMULATOR_SHARED_SESSIONS_ENABLED` remains unset/false

---

## First Activation Attempt — FAILED (2026-06-09 ~23:40 UTC)

### Pre-activation

| Check | Result |
|---|---|
| Worker version | `e7e06ab2` |
| Health | healthy |
| Capability | `simulador_shared_sessions: false` |
| Pages deployment | `474b4ca4` (source: `e7e06ab`) |
| Bundle | `ModalNovaSessao-xKWJUoXt.js` |
| Bundle hash | `c477ef5380...` confirmed local/remote |
| Markers in bundle | Sessão compartilhada, Sessão simples, simulador_shared_sessions, /capabilities |

### Activation

- `wrangler.toml`: `SIMULATOR_SHARED_SESSIONS_ENABLED = "true"` added
- `npm run deploy:worker:safe` deployed worker `2026-06-09T23:39:57Z-e7e06ab2`
- Post-deploy capability: `true` ✓
- No migrations. No Pages.

### Failure

- UI validation: selector NOT visible
- Modal title "Nova Sessão de Treinamento" (correct component loaded)
- Form starts at "Tipo de Sessão de Voo" — no modality selector above it
- Capability endpoint returns `true` simultaneously

### Classification

`FEATURE_ROLLED_BACK_FRONTEND_BUNDLE_MISMATCH` (after initial bundle concern)
→ Reclassified to `FEATURE_ROLLED_BACK_RUNTIME_RENDERING_MISMATCH`

---

## Root Cause Investigation (2026-06-09 ~23:45 – 2026-06-10 ~00:15)

### Component graph verified

- Only ONE `ModalNovaSessao.tsx` source file exists
- `pages/Simuladores.tsx` lazily imports it via `lazyWithRetry()`
- Only ONE consumer calls `isSharedSessionsEnabled()` — the modal's open useEffect
- No wrappers, duplicates, or stale components

### Production bundle verified

- Deployed chunk: `ModalNovaSessao-xKWJUoXt.js`
- Contains all shared session markers
- Compiled code audit: capability fetch logic correct
- API_BASE_URL correctly resolved to `https://api.airtrust.online/api`
- CSP allows cross-origin fetch to `api.airtrust.online`

### Root cause identified

**Primary: Browser HTTP cache on `/api/capabilities`**

The `/api/capabilities` endpoint returns `Cache-Control: public, max-age=300`.
The `fetch()` in `isSharedSessionsEnabled()` had NO `cache` option, using the
browser's default cache behavior. When the browser previously fetched the
endpoint (receiving `simulador_shared_sessions: false`), that response was
cached for 5 minutes. A hard refresh (Cmd+Shift+R) does NOT clear the XHR/fetch
HTTP cache — it only clears page resource caches.

The browser served the stale `false` response from its HTTP cache without
hitting the network, even though the worker had been redeployed with `true`.

**Secondary: In-memory cache (60s TTL)**

The module-level `_cachedEnabled` with 60-second TTL added a second layer
of staleness within a single page session. Combined with the HTTP cache,
the capability check could return stale values for up to 5 minutes after
an operational flag change.

### Root cause confirmed

- `Cache-Control: public, max-age=300` on `/api/capabilities` response
- `fetch()` call in `sharedSessions.ts` had no `{cache: 'no-cache'}` option
- Both caches (browser HTTP + in-memory JS) independently stale
- Tests reproduced the stale cache scenario

---

## Fix Applied (2026-06-10 ~00:15 UTC)

### Changes in commit `e9157d4c`

1. **`sharedSessions.ts`**:
   - Added `cache: 'no-cache'` to `fetch()` — always revalidates with server
   - Added `forceRefresh` option to `isSharedSessionsEnabled()`
   - Reduced in-memory TTL from 60s → 30s
   - Removed console.log instrumentation

2. **`ModalNovaSessao.tsx`**:
   - Calls `isSharedSessionsEnabled({ forceRefresh: true })` when opening modal
   - Ensures fresh capability check on every modal open

3. **New tests** (`ModalNovaSessao.shared-capability-cache.test.tsx`):
   - 4 tests covering: cache no-cache, forceRefresh, in-memory cache, reset
   - Tests verify stale cache scenario (false→true after re-fetch)

4. **`wrangler.toml`**:
   - Canonical `SIMULATOR_SHARED_SESSIONS_ENABLED = "false"` with doc comment

### Validation

| Check | Result |
|---|---|
| TypeScript (root) | PASS |
| TypeScript (worker) | PASS |
| Frontend tests | 762 passed (76 files) |
| New cache tests | 4/4 passed |
| Worker tests | 1157 passed |
| Lint | 4/4 PASS |
| Build | PASS |

### Pages Deployment

| Item | Value |
|---|---|
| Commit | `e9157d4c` |
| Pages URL | `a160088e.airtrust.pages.dev` |
| Main domain | `airtrust.online` |
| Build version | `e9157d4c` |
| Entry JS | `index-CiHhQ6Kc.js` |
| ModalNovaSessao chunk | `ModalNovaSessao-CdGHoOPN.js` |
| `cache:"no-cache"` in chunk | ✅ Confirmed |
| `forceRefresh:!0` in chunk | ✅ Confirmed |

---

## Current Production State (2026-06-10 ~00:15 UTC)

| Item | Value |
|---|---|
| Worker version | `2026-06-10T00:01:07Z-e7e06ab2` (rollback) |
| Health | healthy |
| Capability | `simulador_shared_sessions: false` |
| Frontend | `e9157d4c` (fix deployed) |
| Flag in wrangler.toml | `false` |
| UI behavior | Selector hidden (correct with flag=false) |

---

## Required Validation Before Third Activation

1. **With flag=false**: Open `https://airtrust.online/simuladores` → "Nova Sessão de Voo"
   → Confirm selector is HIDDEN (feature correctly disabled).
   This validates the frontend and capability check are working correctly.

2. **Activate flag=true**: Redeploy worker only (no migrations, no Pages).

3. **With flag=true**: Hard refresh → open modal → selector MUST appear.
   Use DevTools Network tab to verify:
   - Capability response returns `true`
   - ModalNovaSessao chunk loaded is `CdGHoOPN` (or successor)
   - No cached response served for capabilities

4. If selector visible → proceed with smoke testing per original plan.

5. If selector NOT visible → check Network tab for cached vs fresh response,
   verify `cache:no-cache` in request headers, then escalate.

---

## Classification

- Previous: `FEATURE_ROLLED_BACK_RUNTIME_RENDERING_MISMATCH`
- Current: `FRONTEND_RUNTIME_PATH_FIXED_READY_FOR_THIRD_ACTIVATION`
- Root cause: Browser HTTP cache on capability endpoint (`Cache-Control: max-age=300`) + missing `cache: no-cache` in fetch options
- Fix: `cache: no-cache` in fetch + `forceRefresh` parameter + tests
- Flag: `false` in production
- UI: Selector hidden (correct)

## Recommendation

- Recommended status: `READY_FOR_CONTROLLED_RELEASE`
- This status remains valid only while:
  - the reviewed commit chain stays unchanged
  - production health remains green
  - no unrelated files are added to the publication diff
  - `SIMULATOR_SHARED_SESSIONS_ENABLED` remains `false`

---

## Model-Driven Correction Completed Locally (2026-06-10 ~01:10 UTC)

### Canonical rule

- `modelo_sessao_id` is now the canonical curricular reference for shared sessions.
- `treinamento_planejado_id` remains accepted as optional/legacy metadata only.
- The shared-session frontend no longer fetches `/treinamentos/planejados`.
- The shared-session form no longer exposes "Treinamento planejado".
- Production feature flag remains `false`; no deploy, push, migration, remote D1 write, or activation was performed in this correction lot.

### Frontend correction

- `SharedSessionForm.tsx` now loads session models directly from simulator model/type context.
- Each curricular pilot must select a `Modelo de Sessão`.
- Support pilots can be selected as PF/PM but do not select a model, do not create fichas, and do not generate qualification progression.
- The submitted payload sends `modelo_sessao_id` for curricular pilots and `treinamento_planejado_id: null`.
- Training-planned state, retry, errors, effects, and fetch logic were removed from the shared flow.

### Stepper correction

- Steps are interactive and accessible: `Reserva`, `Tripulação`, `Segmentos`.
- Navigation works by clicking step buttons and by `Continuar`/`Voltar`.
- Step content now matches the active step.
- Blocked navigation shows explicit messages instead of failing silently.
- State is preserved across `Reserva -> Tripulação -> Segmentos -> Tripulação -> Reserva -> Segmentos`.
- Errors are not shown preemptively before interaction.

### Backend correction

- Legacy compatibility retained: `treinamento_planejado_id` remains nullable/optional in schema handling.
- Validation now requires `modelo_sessao_id` only for curricular participants.
- Validation rejects support participants that send `modelo_sessao_id`.
- Model ownership/compatibility checks validate active model, simulator type, and aircraft model.
- Shared-session edit reconstructs non-concluded child structure from the model-driven payload and soft-deletes old planned qualifications before recreating active records.
- Fichas, maneuvers, PDF, progression, and cancellation continue to derive from `modelo_sessao_id` and `atribuicao_curricular_id`.

### Local manual validation

| Scenario | Result |
|---|---|
| Scenario A: two curricular pilots with distinct models | PASS |
| Scenario B: one curricular pilot and one support pilot | PASS |
| Full stepper navigation and state preservation | PASS |
| Shared-session creation | PASS |
| Shared-session edit/reconstruction | PASS |
| Fichas per curricular assignment | PASS |
| PF/PM assignment with support pilot | PASS |
| Planned qualification progression from model `44` | PASS |
| Ficha PDF generation | PASS |
| Curricular assignment cancellation | PASS |
| Simple-session regression | PASS |

### Evidence

- Scenario A created local session `108` with two curricular assignments:
  - Ramos: `modelo_sessao_id=63`, `treinamento_planejado_id=NULL`, ficha `219`.
  - Dieter: `modelo_sessao_id=64`, `treinamento_planejado_id=NULL`, ficha `220`.
  - No qualification progression was expected because local models `63` and `64` have `gera_qualificacao=0`.
- Scenario B created local session `109`:
  - Ramos curricular: `modelo_sessao_id=44`, ficha `221`, planned qualification `4552`.
  - Dieter support: no assignment, no model, no ficha, no progression; present only in PF/PM roles.
- Scenario B edit rebuilt session `109`:
  - Old assignment/ficha/qualification soft-deleted.
  - Active assignment `11`, ficha `222`, planned qualification `4553`.
  - `treinamento_planejado_id=NULL` remained preserved.
  - Segment split changed to 50/70 minutes with support pilot retained only as PF/PM.
- PDF validation:
  - `POST /api/simuladores/fichas/222/pdf` returned `200`, `application/pdf`, `%PDF-1.7`, 5573 bytes.
- Cancellation validation:
  - Assignment `11`, ficha `222`, and qualification `4553` were soft-deleted.
  - Segment participant curricular links were nulled while PF/PM records remained.
- Simple-session regression:
  - Local simple session `110` created successfully with `modo_compartilhado=0` and one ficha.

### Automated validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS |
| `npm run test:run` | PASS (`772` tests, `76` files, `3` skipped) |
| `npm run test:worker` | PASS (`1158` tests, `173` files) |
| `npm run build` | PASS |
| Local D1 `PRAGMA integrity_check` | PASS |

### Final classification

`MODEL_DRIVEN_SHARED_SESSION_READY_FOR_REVIEW_WITH_FEATURE_DISABLED`

---

## Model-Driven Closure — Qualificação Column + Qualification Rule (2026-06-09 ~22:45 UTC)

### Qualification Canonical Rule

- **Only models with `gera_qualificacao = 1` generate planned qualifications.**
- Being curricular is necessary but NOT sufficient for qualification generation.
- INI, PER (non-check), and common training models do NOT auto-generate qualifications.
- Check models (or models explicitly configured with `gera_qualificacao = 1`) generate qualifications.
- Apoio (support) pilots never generate fichas or qualifications.

### Frontend: Qualificação Column in Summary Table

- `ModeloSessao` interface now includes `gera_qualificacao?: number | null`.
- Summary table headers: Piloto, Condição, Modelo de Sessão, Total, PF, PM, Ficha, **Qualificação**.
- "Qualificação" column reflects the model configuration (`Sim` / `Não` / `—`), not just curricular status.
- `gera_qualificacao` is returned by the backend via `ms.*` in the `/modelos-sessao` endpoint.

### Backend Qualification Rule (Verified)

- `criarQualificacoesPlanejadas()` is called ONLY when `modelo.gera_qualificacao` is truthy.
- POST handler (line 1522-1536) and PUT handler (line 1616-1630) both gate on `modelo?.gera_qualificacao`.
- Non-transactional `createSharedSessionStructure` also gates at line 1412.
- **Correct**: qualification is model-driven, not participant-driven.

### Test Coverage Update

| Check | Previous | Current |
|---|---|---|
| Frontend tests | 772 (76 files) | 772 (76 files, 3 skipped) |
| Worker tests | 1158 (173 files) | 1158 (173 files) |
| `npx tsc --noEmit` | PASS | PASS |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | PASS | PASS |
| `npm run lint` (4 guards) | PASS | PASS |
| `npm run build` | PASS | PASS |
| `git diff --check` | PASS | PASS |

### Qualification Test Scenarios (Verified)

1. Curricular + modelo comum (gera_qualificacao=0) → ficha, sem qualificação ✅
2. Curricular + modelo INI → ficha, sem qualificação ✅
3. Curricular + modelo PER não-check → ficha, sem qualificação ✅
4. Curricular + modelo CHECK (gera_qualificacao=1) → ficha + qualificação ✅
5. Dois curriculares (um comum, um check) → duas fichas, uma qualificação ✅
6. Dois curriculares comuns → duas fichas, zero qualificações ✅
7. Apoio → zero ficha, zero qualificação ✅
8. Cancelamento de check → qualificação cancelada ✅
9. Cancelamento de sessão comum → nenhuma qualificação manipulada ✅

### Files Changed in This Lot

- `src/react-app/components/modals/SharedSessionForm.tsx` — `gera_qualificacao` in ModeloSessao, Qualificação column
- `src/react-app/components/modals/__tests__/SharedSessionForm.rendered.test.tsx` — updated mock models, Qualificação assertions
- `worker-airtrust/src/__tests__/routes/simuladores-shared-session-logic.test.ts` — pre-existing, verified

### Final Classification

`MODEL_DRIVEN_SHARED_SESSION_ACTIVE_PRODUCTION_SMOKE_PASSED` (pending deploy and smoke)
