# AIRTRUST PR105 P0-C Revalidation — 2026-06-20

## Scope

- PR: `#105`
- Branch: `codex/multitenant-readiness-hardening`
- Baseline commit with P0-C fix: `8d9f312c`
- Worktree: `/private/tmp/airtrust-multitenant-readiness`
- No deploy
- No migration
- No remote SQL
- No database changes

## P0-C Status

P0-C for public SCORM routes is validated as fixed.

- `worker-airtrust/src/routes/lms-assets.ts` preserves public fallback by resolving `empresa_id` from `getEmpresaIdOptional(c) || Number(payload.empresa_id ?? 0)`.
- `worker-airtrust/src/__tests__/routes/lms-assets-scorm-public-empresa-fallback.test.ts` passes.

## TypeScript Comparison

Commands executed:

```bash
npx tsc --noEmit
git fetch origin --prune
git worktree add /tmp/airtrust-pr105-origin-main-tsc origin/main
npx tsc --noEmit
```

Results:

- PR branch: `npx tsc --noEmit` passed.
- `origin/main`: `npx tsc --noEmit` passed after mirroring local dependency directories into the comparison worktree.

Conclusion:

- No TypeScript error remains on the PR branch.
- The previously reported `escalas-core.ts`, `frms.ts`, and `tenant-fail-closed.test.ts` failures were not reproducible in the current branch state.

## Corrections Applied In This Revalidation

The PR introduced a new runtime dependency in auth route tests on the `rateLimitPresets` export from `worker-airtrust/src/middleware/rate-limit.ts`. Two tests still mocked the module as if only `rateLimiter` existed.

Files updated:

- `worker-airtrust/src/__tests__/routes/auth-dev-login-bypass.test.ts`
- `worker-airtrust/src/__tests__/routes/auth-invite-empresa-id.test.ts`

Change made:

- switched both `vi.mock('../../middleware/rate-limit', ...)` blocks to partial mocks via `importOriginal`, preserving real named exports while overriding only `rateLimiter`.

Why:

- this restores compatibility with the hardening change in `worker-airtrust/src/routes/auth.ts` that now consumes `rateLimitPresets.login`.

## Validation Results

### Static validation

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Status:

- `npx tsc --noEmit`: pass
- `npm run lint`: pass
- `npm run build`: pass

### Targeted PR tests

Worker/LMS:

```bash
npm run test:worker -- --run lms-assets-scorm-public-empresa-fallback
npm run test:worker -- --run lms-assets-resume assets-tenant-ownership
```

Status:

- pass

Security / tenant / platform:

```bash
npm run test:worker -- --run platform-access rbac-platform-admin-boundaries auth-platform-admin-boundaries platform-support-gradual-enforcement tenant-fail-closed support-role-not-yet-active maintenance-guards middleware escalas-shared-tenant-helper
npm run test:run -- --run vite-dev-proxy-guard ProtectedRoute.module-gating
```

Status:

- pass

Auth regression after mock fix:

```bash
npm run test:worker -- --run auth-dev-login-bypass auth-invite-empresa-id
```

Status:

- pass

Note:

- The literal root command `npx vitest run lms-assets-scorm-public-empresa-fallback` does not discover worker tests because root Vitest includes only `src/**`. The worker-equivalent command above was used for the actual verification.

## Full Worker Suite

Command executed:

```bash
npm run test:worker
```

Current result after fixes:

- `200` test files passed
- `6` test files failed
- `1402` tests passed
- `12` tests failed

Remaining failing areas on the PR branch:

- `src/__tests__/architecture/architecture-performance-guard.test.ts`
- `src/__tests__/migrations/dq01-controlled-backfill-gate.test.ts`
- `src/__tests__/migrations/migration-governance.test.ts`
- `src/__tests__/migrations/readiness-audit-scripts.test.ts`
- `src/__tests__/routes/lms-cursos-beta-contract.test.ts`
- `src/__tests__/services/dashboardService.repository-contract.test.ts`

## Preexisting Failures Confirmed Against origin/main

The exact failing subset above was re-run in `/tmp/airtrust-pr105-origin-main-tsc` on `origin/main`.

Result:

- the same 6 files fail on `origin/main`
- the same 12 tests fail on `origin/main`

This confirms the remaining failures are preexisting outside PR #105 scope.

Examples of confirmed preexisting failures:

- architecture guard line-count / SQL-prepare caps
- readiness audit expecting `empresa_sem_admin`
- migration governance expecting max regular prefix `0410` while repo now has `0411`
- LMS beta contract mock missing coverage for `SELECT ... FROM lms_cursos_setores`
- dashboard repository contract expecting 2-arg repository calls while implementation supplies a third optional argument

## Git State

Files changed in this revalidation:

- `worker-airtrust/src/__tests__/routes/auth-dev-login-bypass.test.ts`
- `worker-airtrust/src/__tests__/routes/auth-invite-empresa-id.test.ts`
- `docs/AIRTRUST_PR105_P0C_REVALIDATION_20260620.md`

## Recommendation

Status: `OK COM RESSALVAS`

Rationale:

- P0-C is fixed and validated.
- `tsc`, lint, build, and all targeted PR #105 regressions pass.
- The only exclusive PR regression found during revalidation was the auth test mocking breakage, and it is fixed.
- The remaining full-suite failures are reproducible on `origin/main` and are therefore preexisting.

Push/review readiness:

- technically ready for local commit
- ready for push and Opus re-review after explicit push authorization
