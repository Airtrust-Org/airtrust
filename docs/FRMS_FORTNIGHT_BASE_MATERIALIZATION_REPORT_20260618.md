# FRMS Fortnight Base Materialization Report

Date: 2026-06-18
Scope: controlled materialization of `dia_periodo_embarcado` / `total_dias_periodo` from base fortnight only
Status: local implementation and validation completed; production execution not performed from this worktree

## Summary

- Added a read-only maintenance coverage endpoint in the worker route layer for the existing fortnight coverage service.
- Added a new controlled maintenance preview/apply flow for fortnight base materialization.
- Apply is fail-closed behind `MAINTENANCE_SECRET`, requires explicit confirmation token, and is limited to 15 days.
- The writer is narrow and idempotent: it updates only `frms_fatorizacao_jornada.dia_periodo_embarcado` and `frms_fatorizacao_jornada.total_dias_periodo`.
- The flow does not call broad FRMS reprocessing, does not call SIGVOOS sync, does not use `clearExisting`, and does not touch `frms_jornada`, `frms_alerta`, `frms_acumulo_rolling`, source policy, R2, or migrations.

## Endpoints

- `GET /api/frms/maintenance/fortnight-coverage`
- `GET /api/frms/maintenance/fortnight-materialization-preview`
- `POST /api/frms/maintenance/fortnight-materialization-apply`

### Preview

- Requires maintenance secret.
- Accepts `empresa_id`, `data_inicio`, `data_fim`, optional `origem`, optional `status`.
- Maximum window: 31 days.
- Returns scope counts, candidate counts, and embedded coverage snapshot.
- Performs no writes.

### Apply

- Requires maintenance secret.
- Requires `confirm=APPLY_FORTNIGHT_BASE`.
- Accepts `empresa_id`, `data_inicio`, `data_fim`, optional `origem`, optional `status`.
- Maximum window: 15 days.
- Hard cap: 20 candidate records.
- Updates only rows still matching `dia_periodo_embarcado IS NULL` at write time.
- Returns updated count and unchanged-after-guard count.

## Safety Model

- Company scope is explicit via `empresa_id`.
- Window scope is explicit via `data_inicio` / `data_fim`.
- Candidate selection is restricted to:
  - rows in `frms_fatorizacao_jornada` joined to `frms_jornada`
  - active fortnight derived from `funcionarios.quinzena + escalas_quinzenas`
  - no existing `dia_periodo_embarcado`
  - no blocking absence
- Rows tied to `escala_alocacoes`, `frms_escala_quinzenal`, or no detected scale remain out of apply scope.
- Re-running apply converges without widening the write surface.

## Local Validation

- Focused worker tests passed:
  - `src/__tests__/frms/fortnight-materialization.test.ts`
  - `src/__tests__/frms/fortnight-coverage.test.ts`
  - `src/__tests__/lib/active-fortnight.test.ts`
  - `src/__tests__/routes/maintenance-guards.test.ts`
- Root checks passed:
  - `npx tsc --noEmit`
  - `git diff --check`
  - `npm run guard:tracked-secrets`
  - `npm run ops:guard`
  - `npm run lint`
  - `npm run build`

## Production Execution Status

Not executed from this workspace.

Reason:

- Current workspace is not a clean `main`-based deploy surface.
- Local audit shows `deploy:worker:safe` does not enforce a clean tree, so deploying from a dirty or drifted workspace risks publishing unrelated code.
- This thread is on a branch ahead of `origin/main` with unrelated local modifications already present in FRMS files.

## Next Safe Operational Step

1. Move these changes onto a clean branch/worktree based on current `origin/main`.
2. Open PR: `feat(frms): add controlled fortnight base materialization`
3. Require green CI plus worker-focused validation.
4. Merge to `main`.
5. Deploy worker only, with pages disabled and production migrations disabled.
6. After deploy, run:
   - `GET /api/version`
   - `GET /api/health`
   - preview `7d`
   - preview `15d`
   - apply `15d` only if preview counts match expected safe envelope
   - coverage `7d` / `15d` again
