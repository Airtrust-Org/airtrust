# Environment Endpoints

Data: 2026-07-02
Status: Operational reference

## Canonical URLs

- Produção canônica: `https://api.airtrust.online`
- Produção fallback técnico: `https://airtrust-api-production.airtrust.workers.dev`
- Produção proibida para decisão operacional: `https://airtrust-api.airtrust.workers.dev`
- Staging: `https://airtrust-api-staging.airtrust.workers.dev`

## Frontend routing

- Local: `http://localhost:3000` ou `http://127.0.0.1:3000` usa proxy para `http://localhost:8787/api`
- Staging Pages: `main.airtrust.pages.dev` roteia para `https://airtrust-api-staging.airtrust.workers.dev/api`
- Produção Pages e domínio final: `airtrust.online`, `www.airtrust.online`, `api.airtrust.online` e `*.airtrust.pages.dev` roteiam para `https://api.airtrust.online/api`

## Smoke scripts

- `scripts/smoke-staging-auth.mjs`
  - staging only
  - usa `STAGING_API_BASE_URL`, `STAGING_SMOKE_EMAIL`, `STAGING_SMOKE_PASSWORD`
- `scripts/smoke-production-auth.mjs`
  - read-only em produção
  - usa `PROD_API_BASE_URL`, `PROD_SMOKE_EMAIL`, `PROD_SMOKE_PASSWORD`
- `scripts/staging-doctor.mjs`
  - valida staging, o `wrangler.toml` e os guards de URL

## Não fazer

- Não usar `https://airtrust-api.airtrust.workers.dev` como referência de produção.
- Não reutilizar `smoke-staging-auth.mjs` em produção.
- Não colar senha, token, JWT ou cookie em comando/log.
- Não persistir token em arquivo.
- Não mudar `env.production` para “testar” um smoke.
- Não confundir domínio canônico com endpoint workers.dev.
