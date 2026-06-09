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
