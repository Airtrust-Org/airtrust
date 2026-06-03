# AirTrust Audit v2 Local/Staging Evidence 2026-06-03

**Data:** 2026-06-03
**Branch:** `main`
**HEAD base:** `87a5b2b3e107b72a64fb9d79080ea21068145816`
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

- `AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK`: `YES`
- `AIRTRUST_AUDIT_V2_TARGET`: `local`
- local/staging activation check: `PASS`
- dual-write local check: `PASS`
- schema local criado: sim
- `audit_events_v2` disponível: sim
- índices validados: sim
- flag local ligada apenas no processo: sim
- writer legado preservado: sim
- writer v2 chamado: sim
- falha do v2 isolada: sim
- metadata sanitizada: sim
- produção tocada: não

## Testes executados

- `bash scripts/validation/audit-v2-local-activation-check.sh`
- `bash scripts/validation/audit-v2-dual-write-local-check.sh`
- `worker-airtrust/src/__tests__/audit/audit-events-v2-activation-readiness.test.ts`
- `worker-airtrust/src/__tests__/audit/audit-events-v2-writer.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-cursos-beta-contract.test.ts`
- suites gerais de `build`, `test`, `test:worker`, `tsc`, `ops:guard` e smoke público autenticado em modo read-only

## Higiene de evidência

- PII em evidência: não
- token/cookie/senha/CPF/ASO/dado médico/payload bruto: não
- secrets versionados: não

## Decisão

`READY_FOR_STAGING_FLAG_TEST`

## Próxima ação

Executar a próxima fase em ambiente staging aprovado, com schema aplicado e rollback por flag preparado, antes de qualquer ativação controlada fora do ambiente local.
