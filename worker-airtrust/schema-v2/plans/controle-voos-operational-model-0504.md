# controle-voos-operational-model-0504

## Objective

Align flight creation and fueling with the operational model requested for AirTrust: canonical point search, editable flight-type/contract/onboard-role catalogs, explicit flight identifiers, and fueling per stage with multiple invoice entries.

## Data model

- Add tenant-scoped `cv_contratos` and `cv_funcoes_bordo` catalogs.
- Add `numero_voo`, `numero_db` and `contrato_id` to `cv_voos`.
- Add `funcao_bordo_id` to `cv_voo_tripulantes`, retaining legacy `funcao` for historical compatibility.
- Add an index for `cv_voo_abastecimentos.etapa_id`; the table already supports multiple fueling rows per stage, so no duplicate fueling table is created.
- Keep `cv_naturezas_voo` only because the legacy `cv_voos.natureza_voo_id` FK is NOT NULL. New flight creation resolves a neutral `OPERACIONAL` compatibility row and does not expose Natureza to users.
- Add editable initial type rows: Contrato, Spot, Manutenção, Treinamento, Aeromédico.
- Add editable initial onboard-role rows: Examinador, Instrutor, Comandante, Copiloto.

## Safety / tenant isolation

All catalogs are tenant-scoped by `empresa_id`. Application reads/writes must require the authenticated tenant and active catalog rows. Existing flights, crew and fueling rows are not rewritten. Existing legacy Natureza data remains untouched.

## Rollout order

1. Verify exact `main` SHA and all eight release gates.
2. Capture D1 recovery point through the governed Schema V2 workflow.
3. Apply Schema V2 0504 and ledger it atomically.
4. Validate tables, columns, indexes and tenant-scoped defaults.
5. Deploy Worker before/with Pages because the frontend depends on the new catalogs and flight columns.
6. Validate create-flight search, contract/type/onboard-role selection, and stage-scoped fueling.

## Rollback / compensation

The change is additive. On failed schema apply use the captured D1 recovery point. After successful apply, application rollback is forward-compatible because the new tables/columns can remain unused; do not drop historical columns remotely.
