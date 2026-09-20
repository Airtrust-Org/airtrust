# controle-voos-delay-justification-catalog-0507

## Objective

Load the Petrobras AA41-AA94 flight-delay justification catalog supplied by the operator into the tenant-scoped Controle de Voos justification model, preserving the source grouping and descriptions and making the catalog easy to find in both administration and the Pilot App.

## Source

User-supplied one-page Petrobras reference: **Instruções de apontamento dos códigos de atrasos dos voos** (2026-09-20). The migration preserves the source codes, titles, five category headings and available explanatory text. Where the source contains no explanatory sentence for a code, the description remains null rather than being invented.

## Data model

- Add nullable `categoria` to `cv_justificativas_voo`.
- Add tenant/category/order index for catalog browsing.
- Seed exactly 54 active codes, AA41 through AA94, into `empresa_id = 6`.
- In production, read-only verification confirmed `empresa_id = 6` is Costa do Sol Táxi Aéreo.
- In staging, `empresa_id = 6` is the existing Pilot smoke tenant, so the same reviewed migration supports real workflow validation without cross-tenant writes.

## Application behavior

- Pilot App search matches code, title, category and description, accent-insensitively.
- Results are grouped under the five source categories: Empresa Aérea; Solicitação da Unidade Marítima; Necessidade Operacional; Gestão Aeroportuária; Condições Meteorológicas.
- Each result shows code + title and the source explanation when present.
- The operator guidance "Busque sempre a causa raiz do motivo do atraso." is displayed above the selector.
- Existing exact-minute planning-deviation validation remains unchanged.
- The admin catalog gains category editing and a catalog search box.
- Pilot service-worker cache advances to v27 so iPad/Safari receives the updated UI.

## Safety / tenant isolation

The catalog remains tenant-scoped. Only tenant 6 receives seed rows. Existing 0506 cross-tenant triggers continue to protect per-flight justification links. No flight history or existing justification links are rewritten.

## Staging validation

1. Apply 0507 through the official staging migration allowlist with recovery point.
2. Verify the new column and index.
3. Verify exactly 54 active AA41-AA94 rows and five categories in tenant 6.
4. Deploy Worker + Pages from the same SHA.
5. Validate Pilot App search examples: AA62, meteorologia, manutenção Costa do Sol, pax, heliponto.
6. Validate selection + minute allocation still blocks until the exact planning deviation is explained.

## Production rollout

Production requires exact SHA authorization for Schema V2 `controle-voos-delay-justification-catalog-0507`, followed by Worker + Pages after successful schema postconditions.

## Rollback / compensation

The category column and index are additive and may remain during application rollback. If seeded rows must be compensated after a completed apply, inactivate only the 54 reviewed AA41-AA94 rows for empresa_id 6 in a separately reviewed governed change; do not drop history referenced by flights. On failed atomic apply, use the captured D1 Time Travel recovery point.
