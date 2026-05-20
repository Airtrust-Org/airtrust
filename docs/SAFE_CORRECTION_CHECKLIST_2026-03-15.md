## Safe Correction Checklist

Status date: 2026-03-15

### Immediate P0 closure

- Rotate EdApp production tokens outside Git history.
- Re-write any local auxiliary worktree that still contains real secrets.
- Keep `ENABLE_DEV_AUTH_BYPASS` only in `worker-airtrust/.dev.vars` and never in tracked `wrangler*.toml` files.
- Remove generated runtime logs with environment echoes from version control.

### Post-deploy smoke gate

- `bash scripts/smoke-test-core.sh`
- `AIRTRUST_SMOKE_EMAIL=... AIRTRUST_SMOKE_PASSWORD=... bash scripts/smoke-test-alocacao.sh`
- `AIRTRUST_SMOKE_EMAIL=... AIRTRUST_SMOKE_PASSWORD=... WEB_BASE=https://airtrust.online BASE=https://airtrust-api-production.airtrust.workers.dev bash scripts/smoke-test-sgso.sh`
- `AIRTRUST_SMOKE_EMAIL=... AIRTRUST_SMOKE_PASSWORD=... bash scripts/smoke-test-integracoes-completo.sh`

### Manual high-risk checks

- Login with admin user.
- Dashboard loads with real data.
- Funcionarios list opens and paginates.
- Qualificacoes detail opens.
- FRMS dashboard loads.
- Escalas current month opens.
- Minha Escala opens for a crew user.
- EVD opens.
- Certificate PDF generation succeeds.
- XLSX import modal opens and parses a sample file.

### Safety rules for refactoring

- No feature work in the same PR as refactoring.
- Every refactor PR must be revertible with a single commit rollback.
- Prefer extraction without logic rewrite on the first pass.
- Re-run the smoke gate after every production deploy.

### Current notes

- SGSO smoke was re-run on 2026-03-15 and passed end-to-end with authenticated routes.
- `worker-airtrust/src/index.ts` still contains 25 inline route registrations, including 7 `/api/admin/*` endpoints.
- The main remaining monoliths are route extraction, repository layer adoption, and frontend component decomposition.