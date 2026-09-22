# controle-voos-flight-plan-0509

## Objective

Add the tenant-scoped persistence boundary required for an AirTrust structured flight-plan workflow without coupling the database to the current FPL-BR user interface or assuming an undocumented public API.

The schema is additive only. Application code may continue using the current `PLANO_VOO` document attachment until a later application PR activates structured editing.

## Authoritative operational sources reviewed

- DECEA ICA 100-11 — Plano de Voo.
- DECEA MCA 100-11 — Preenchimento dos Formulários de Plano de Voo.
- DECEA AIC N 87/2024 / AIC N 29/24 — Centralizador de Plano de Voo no Brasil e endereçamento de mensagens.
- The centralizer flow covers ATS messages FPL, CHG, DLA and CNL.
- The documented webservice is made available to regular airlines through SIGMA authorization. AirTrust therefore models a provider boundary but does not enable `SIGMA_WEBSERVICE` until the operator has the official contract, authorization and credentials.

## Data model

### cv_planos_voo

One active structured plan per AirTrust flight and tenant.

Key properties:
- immutable `empresa_id + voo_id` link;
- optimistic `versao`;
- closed workflow status: rascunho, pronto, submetido, aceito, rejeitado, cancelado;
- versioned `payload_json` so the application can evolve the exact DECEA field contract without schema churn;
- searchable projection fields for aircraft identification, origin, destination, operational date and EOBT;
- provider: `MANUAL` or `SIGMA_WEBSERVICE`;
- no password, token, user credential or other DECEA secret column;
- protocol/external IDs and current provider status are operational metadata only.

### cv_plano_voo_eventos

Append-only integration ledger.

It records:
- ATS message family: FPL, CHG, DLA, CNL;
- outbound/inbound direction when applicable;
- provider status/response metadata;
- external/request IDs;
- sanitized request/response payload snapshots when application policy allows them.

Rows cannot be updated or deleted.

## Tenant isolation

- Inserting a flight plan requires the referenced `cv_voos` row to belong to the same `empresa_id` and be active.
- The plan tenant/flight link is immutable.
- Inserting an event requires the referenced plan to belong to the same tenant.
- One active plan exists per tenant/flight.

## Secret boundary

This schema intentionally contains no DECEA username, password, bearer token, client secret or session cookie. Provider credentials must remain in the approved secret store/bindings and never in D1, logs, commits or chat.

## Application sequence after schema approval

1. Add backend CRUD for the structured draft with CAS and tenant/RBAC checks.
2. Add a `Plano de voo` section inside the existing flight detail instead of another top-level screen.
3. Auto-populate values already known by AirTrust.
4. Keep `PLANO_VOO` document attachment as legacy compatibility while the structured flow is introduced.
5. Add a manual provider that validates/prepares the ATS content without submitting to DECEA.
6. Enable `SIGMA_WEBSERVICE` only after Costa do Sol receives the official integration contract and authorization from SIGMA/DECEA.
7. Add governed staging E2E before any production rollout.

## Staging validation

1. Apply through Schema V2 with recovery point.
2. Confirm both tables and indexes.
3. Prove cross-tenant plan/event inserts fail closed.
4. Prove only one active plan per flight.
5. Prove event rows are append-only.
6. Prove no existing `cv_voos` row is modified.
7. Deploy application code only after the schema postconditions are green.

## Rollback / compensation

The change is additive. On failed atomic apply, use the captured D1 Time Travel recovery point. If application rollout is reverted after a successful schema apply, leave the unused tables in place until a separately reviewed compensating schema change; do not drop integration history ad hoc.
