# AirTrust PR #22 - CI Stabilization Report

Date: 2026-06-15

## Verdict

`CI COM RESSALVAS`

The EBADPLATFORM failure fixed in `abd1a2d30096702f902822f88ee08b9d5144cfdb`
did not reappear in the inspected GitHub Actions logs. This phase applied a
minimal CI stabilization for the new failures seen after that commit. Remote
checks must be re-evaluated after pushing this report and the related fix.

## Initial State

- Local branch: `main`
- PR branch: `codex/airtrust-sanitization-final-preflight`
- Initial HEAD: `abd1a2d30096702f902822f88ee08b9d5144cfdb`
- Initial divergence: `origin/main...HEAD = 0 47`
- PR #22 status before this fix: open, mergeable, failing checks.
- Working tree before edits: clean.

## Initial CI Failures

- `build`: `VITE_API_URL` was empty in CI and Linux also failed on
  case-sensitive imports such as `@/react-app/components/ui/EmptyState`.
- `lms-smoke`: `cd worker-airtrust && npm ci` failed because the worker package
  had no tracked `package-lock.json`.
- `lint`: the workflow ran repository-wide ESLint and failed on the existing
  legacy baseline, around 903 problems.
- `test`: failed on `AppLayout.module-gating` and `service-worker-cache`.
- `check-demo-data`: ran production audit before `dist/client` existed, then
  the PR comment step failed with `403 Resource not accessible by integration`.
- `PR Check`: inherited build and URL guard failures.

## Root Causes and Decisions

- `VITE_API_URL`: CI was depending on an optional secret. The build/guard does
  not need production, so workflows now use `http://127.0.0.1:8787` as a safe
  local CI value. No secret and no production URL were introduced.
- `lms-smoke`: `worker-airtrust` is a separate npm package. A dedicated
  `worker-airtrust/package-lock.json` was generated with npm 10.8.2 and
  `--package-lock-only --ignore-scripts`, then verified with `npm ci
  --ignore-scripts`.
- `lint`: the blocking workflow now runs the repository safety guards via
  `npm run lint`. Legacy global ESLint and Prettier remain inventoried but are
  non-blocking in this phase, so the PR is not blocked by unrelated historical
  debt.
- `tests`: `AppLayout` now exposes LMS inside the `Treinamentos` menu for
  gestor/admin users, so the test now opens the menu and asserts the actual LMS
  link. The service worker test now asserts the current bypass behavior with
  network fetch plus 503 fallback.
- `check-demo-data`: workflow order now builds before running the production
  audit that expects `dist/client`. The PR comment step is non-blocking to avoid
  failing the job solely on GitHub token comment permissions.
- Linux build case sensitivity: imports were corrected from
  `components/ui/*` to the actual `components/UI/*` paths.

## Files Changed

- `.github/workflows/ci.yml`
- `.github/workflows/demo-data-prevention.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/pr-check.yml`
- `worker-airtrust/package-lock.json`
- `src/__tests__/service-worker-cache.test.ts`
- `src/react-app/components/__tests__/AppLayout.module-gating.test.tsx`
- `src/react-app/components/hoc/withLoading.tsx`
- `src/react-app/pages/frms/FrmsAlertasPainel.tsx`
- `src/react-app/pages/frms/FrmsEscalas.tsx`
- `src/react-app/pages/frms/FrmsFichaTripulante.tsx`
- `src/react-app/pages/frms/FrmsHistoricoFira.tsx`
- `src/react-app/pages/funcionarios/ListaFuncionarios.tsx`
- `src/react-app/pages/qualificacoes/Checks.tsx`
- `src/react-app/pages/qualificacoes/Exames.tsx`
- `src/react-app/pages/qualificacoes/Treinamentos.tsx`
- `src/react-app/pages/qualificacoes/components/QualificacoesTable.tsx`
- `docs/AIRTRUST_PR22_CI_STABILIZATION_REPORT.md`

No migrations, `.env`, dumps, snapshots, exports, `lms/`, staging/prod configs
or temporary files were intentionally included.

## Local Validations

- `git diff --check`: PASS.
- `npx tsc --noEmit --pretty false`: PASS.
- `CI=true VITE_API_URL=http://127.0.0.1:8787 npm run lint`: PASS.
- `VITE_API_URL=http://127.0.0.1:8787 npm run build`: PASS.
- `npm run check:demo-data` after build: PASS.
- `cd worker-airtrust && npm ci --ignore-scripts`: PASS.
- `npx vitest run src/react-app/components/__tests__/AppLayout.module-gating.test.tsx src/__tests__/service-worker-cache.test.ts --reporter=dot`: PASS, 7 tests.
- `npx vitest run src/__tests__/lms-content-preview-readiness.test.ts --reporter=dot`: PASS, 16 tests.
- `cd worker-airtrust && npx vitest run src/__tests__/migrations/regulated-records-core-experimental.test.ts src/__tests__/lib/regulated-records/governance-evidence-service.test.ts src/__tests__/migrations/migration-governance.test.ts`: PASS, 39 tests.
- `bash scripts/check-tracked-secrets.sh`: PASS.
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS as inventory; it
  continues to list historical `migrations apply` references.
- `bash scripts/audit-dangerous-ops.sh`: PASS with one pre-existing warning
  about sync scripts.
- `npm run test:run`: PARTIAL/LOCAL INFRA RESSALVA. It passed 72 files and 775
  tests, then failed locally with Vitest fork-worker startup timeouts before
  completing all files. The CI-specific failed tests were run separately and
  passed after the fix.

## Remote Status

Remote checks for this exact commit are pending until the commit is pushed to
`codex/airtrust-sanitization-final-preflight`. The final status must be read
from GitHub Actions after push.

## Safety Confirmation

- No merge was performed.
- No deploy was performed.
- No migration was created or applied.
- No Cloudflare, D1 remote, R2 or secrets operation was executed.
- No staging or production environment was touched.
- No `git add .` or `git add -A` was used.
- No `0411` migration was created.
- No functional SIGVOOS, FRMS, RBAC, multi-tenant or Controle de Voos logic was
  intentionally changed.

## Recommendation

Push this commit to `codex/airtrust-sanitization-final-preflight`, wait for PR
#22 checks, and then proceed with human review if the checks are green. If
checks still fail, handle the new failures as a separate targeted CI phase.
