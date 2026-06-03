# AirTrust Audit v2 Local/Staging Evidence 2026-06-03

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `78509f9ea40b2bf0a50d9be0f1923f1ea66f5bdd`
**Escopo:** readiness local/staging do Audit v2 sem ativação em produção.

## Estado observado

- migration encontrada: `worker-airtrust/migrations/0385_audit_events_v2.sql`
- writer v2 encontrado: `worker-airtrust/src/lib/audit/audit-events-v2.ts`
- writer legado preservado: sim
- flag default: off confirmada
- schema produção aplicado: não
- D1 remoto manual: não
- dados reais alterados: não

## Execução local/staging

- `AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK`: não configurada nesta execução
- `AIRTRUST_AUDIT_V2_TARGET`: não configurada nesta execução
- local/staging activation check: `SKIPPED_AUDIT_V2_LOCAL_CHECK`
- dual-write local check: `SKIPPED_AUDIT_V2_LOCAL_CHECK`
- motivo: não houve ambiente local/staging explicitamente aprovado por env para rodar os scripts de validação

## Testes executados

- `worker-airtrust/src/__tests__/audit/audit-events-v2-activation-readiness.test.ts`
- `worker-airtrust/src/__tests__/audit/audit-events-v2-writer.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-cursos-beta-contract.test.ts`
- suites gerais de `build`, `test`, `test:worker`, `tsc`, `ops:guard` e smoke público autenticado em modo read-only

## Higiene de evidência

- PII em evidência: não
- token/cookie/senha/CPF/ASO/dado médico/payload bruto: não
- secrets versionados: não

## Decisão

`SKIPPED_NO_APPROVED_ENV`

## Próxima ação

Executar os runners `scripts/validation/audit-v2-local-activation-check.sh` e `scripts/validation/audit-v2-dual-write-local-check.sh` com:

- `AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK=YES`
- `AIRTRUST_AUDIT_V2_TARGET=local`

Somente depois disso considerar staging aprovado para teste de flag.
