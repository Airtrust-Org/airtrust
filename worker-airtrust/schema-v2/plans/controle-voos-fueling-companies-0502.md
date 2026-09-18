# controle-voos-fueling-companies-0502

## Objective

Create a tenant-scoped catalog of fueling companies used by the Pilot App when registering refueling events, while preserving existing historical fueling records in `cv_voo_abastecimentos`.

## Data model and semantics

- Add `cv_empresas_abastecimento` as a tenant-scoped operational catalog.
- Each active item has a stable `codigo`, display `nome`, optional `descricao`, activation flag and ordering.
- The Pilot App receives only active companies from the authenticated tenant in its offline package.
- A pilot selects a catalog entry; offline sync sends its code and the Worker resolves the active tenant row server-side before persisting the canonical company name into the existing `cv_voo_abastecimentos.fornecedor` text field.
- No new foreign key is added to historical fueling rows, so prior records remain valid and unchanged.
- Fueling time is no longer user-entered in the Pilot App; the local draft records an internal timestamp automatically when the fueling entry is created.

## Safety / rollout

- The schema change is additive.
- Tenant isolation is fail-closed: catalog GET/management and offline-sync resolution always include `empresa_id`.
- The Worker that queries `cv_empresas_abastecimento` must not be deployed before Schema V2 0502 is applied.
- No seed data is invented. Authorized users create the tenant's fueling-company catalog through Cadastros Operacionais.
- No remote ad-hoc SQL is allowed.

## Apply

1. Verify exact main SHA and all eight required GitHub Actions gates.
2. Capture the governed D1 recovery point.
3. Validate baseline, SQL hash and plan hash.
4. Apply `0502_controle_voos_fueling_companies.sql` through the governed Schema V2 workflow and record the ledger entry.
5. Verify table and indexes exist and tenant-scoped uniqueness works.
6. Deploy the compatible Worker + Pages.
7. Validate Cadastros Operacionais, Pilot offline package, fueling company selection and successful sync.

## Rollback / compensation

The table is additive. If application behavior must be rolled back, stop using the catalog through a forward code change while leaving the table intact. If the atomic schema apply fails, restore through the captured D1 recovery point.
