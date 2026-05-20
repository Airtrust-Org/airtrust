## Safe Refactor PR Sequence

Status date: 2026-03-15

### PR 1

Scope: local config hygiene and smoke gate documentation.

- Remove tracked generated logs.
- Keep local-only secrets and bypass flags in `.dev.vars`.
- Document mandatory smoke scripts and manual checks.

### PR 2

Scope: extract inline admin migration handlers from `worker-airtrust/src/index.ts`.

- Create `worker-airtrust/src/routes/admin/migrations.ts`.
- Move `/api/admin/apply-migration-0133`.
- Move `/api/admin/apply-migration-0134`.
- Move `/api/admin/apply-migration-0135`.
- Move `/api/admin/apply-migration-0136`.
- Keep behavior byte-for-byte equivalent on first extraction.

### PR 3

Scope: extract remaining inline admin and public utility routes from `worker-airtrust/src/index.ts`.

- Create `worker-airtrust/src/routes/admin/debug.ts` if needed.
- Move public translation and status helpers out of `index.ts`.
- Leave `index.ts` as app assembly plus top-level middleware only.

### PR 4

Scope: split `worker-airtrust/src/routes/simuladores.ts` by subdomain.

- `routes/simuladores/core.ts`
- `routes/simuladores/agendamentos.ts`
- `routes/simuladores/sessoes.ts`
- `routes/simuladores/fichas.ts`

### PR 5

Scope: split `worker-airtrust/src/routes/frms.ts`.

- `routes/frms/core.ts`
- `routes/frms/dashboard.ts`
- `routes/frms/calculos.ts`

### PR 6

Scope: start repository extraction for one bounded domain.

- Introduce `worker-airtrust/src/repositories/frms/` or `worker-airtrust/src/repositories/sgso/`.
- Move only read queries first.
- Keep SQL text unchanged on first extraction.

### PR 7+

Scope: frontend component decomposition with behavior lock.

- `DashboardPrincipal.tsx`
- `FrmsImportacaoFira.tsx`
- `EscalasDetalheView.tsx`
- `Qualificacoes.tsx` last

### Acceptance rule for every PR

- Build passes.
- Focused tests pass.
- Smoke scripts stay green.
- No unrelated formatting or feature changes.