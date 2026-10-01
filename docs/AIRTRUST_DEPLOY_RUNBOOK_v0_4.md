# AIRTRUST v0.4 — Runbook histórico de deploy

> **APOSENTADO em 2026-10-01. NÃO USAR PARA EXECUÇÃO.**
> Este arquivo é mantido apenas como referência histórica do modelo anterior de deploy local.

O contrato operacional vigente está em `DEPLOYMENT_AND_DEVOPS.md`, nas instruções canônicas do
projeto e nos workflows atuais da `.github/workflows/`.

## Fluxo vigente

- CI oficial: oito gates GitHub Actions (`lint`, `build-content-gates`, `worker-typecheck`,
  `frontend-coverage`, `worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`).
- Staging: `.github/workflows/deploy-staging.yml`.
- Produção: `.github/workflows/deploy-airtrust.yml`, com autorização explícita do SHA/artefato/escopo.
- Schema de produção: `.github/workflows/apply-schema-change-v2.yml`.
- Google Cloud Build: contingência, nunca bypass de gates.

## Entry points locais

Os aliases locais de produção (`deploy`, `deploy:pages`, `deploy:worker`, `deploy:worker:only`,
`deploy:all`) são fail-closed. O wrapper local de Worker existe apenas para emergência explicitamente
autorizada e validada; não é a rota rotineira.

Consulte sempre a `main` atual antes de qualquer release. Merge ou CI verde não significam deploy.
