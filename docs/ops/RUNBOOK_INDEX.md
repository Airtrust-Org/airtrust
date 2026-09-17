# AirTrust — Índice rápido de runbooks

Use este arquivo para chegar ao procedimento correto sem navegar por documentação histórica.

## Desenvolvimento e continuidade

- Fluxo de execução ChatGPT/GitHub: `docs/ops/AGENT_WORKFLOW.md`
- Handoff de frente: `docs/ops/WORK_FRONT_TEMPLATE.md`
- Estado mestre vivo: GitHub issue #776
- Regras gerais de agente: `AGENTS.md`
- Convenções/arquitetura do código: `CLAUDE.md`

## CI e testes

- Fast gates: `.github/workflows/ci.yml`
- Heavy gates: `.github/workflows/heavy-ci.yml`
- Verificador dos gates: `scripts/ci/verify-release-gates.mjs`
- Seleção rápida local: `docs/ops/TEST_FAST_PATH.md` e `npm run agent:test-plan`

Sempre confirmar estes arquivos na `main` atual antes de decisão de release.

## Staging

- Workflow: `.github/workflows/deploy-staging.yml`
- Runbook: `docs/ops/staging-release-runbook.md`
- Proveniência: `docs/ops/staging-provenance.md`
- Credenciais sintéticas/contrato: `docs/ops/STAGING_CREDENTIAL_CONTRACT.md`

Use workflows específicos de QA já existentes para o módulo (LMS, FRMS, compliance, simulador, UI) em vez de criar navegação manual ad hoc quando já houver cobertura.

## Produção

- Runbook canônico: `docs/PRODUCTION_DEPLOY_RUNBOOK.md`
- Workflow: `.github/workflows/deploy-airtrust.yml`
- Regra: SHA exato + gates + autorização de produção específica + pós-validação.

Documentos antigos de deploy são evidência histórica, não entry point operacional.

## Schema / D1

- Workflow governado: `.github/workflows/apply-schema-change-v2.yml`
- Contratos: `worker-airtrust/schema-v2/`
- Nunca inferir aplicação remota pela existência de arquivo de migration.
- Nunca improvisar SQL remoto quando existir executor governado.

## Incidente / rollback

- Primeiro congelar mutações e identificar Worker, Pages, schema ou dado.
- Produção: seguir a seção de falha/contenção de `docs/PRODUCTION_DEPLOY_RUNBOOK.md`.
- Rollback específico só deve usar runbook atual aplicável e evidência do SHA/artefato.

## Regra de precedência

Código/workflow/proteção atuais > este índice > documentação histórica. O índice é navegação, não autorização.
