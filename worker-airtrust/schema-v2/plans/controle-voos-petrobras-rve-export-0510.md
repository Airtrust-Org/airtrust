# controle-voos-petrobras-rve-export-0510

## Objective
Complete the Costa do Sol Controle de Voos post-flight workflow with deterministic daily Petrobras RVE XML export matching the supplied AE_2026-09-19_SBME_CDS contract.

The existing flight/RDV/stage model already owns dates, engine/takeoff/landing/shutdown times and route legs. Only two client-side identifiers cannot be inferred safely and are added to cv_voos: petrobras_equipamento and petrobras_atendimento.

## Safety and provenance
- Additive columns only.
- No destructive rewrite.
- petrobras_atendimento is backfilled only from a confident SIGVOOS flight_report_id.
- petrobras_equipamento is backfilled from aeronaves.codigo only when the code is strictly numeric.
- Aircraft registrations/prefixes are never guessed into the external equipment field.
- Export remains tenant-scoped and requires the existing RDV Petrobras export capability.

## Operational flow
1. Coordenação creates the flight and may set the external Petrobras identifiers.
2. Pilot fills the Pilot App and sends the RDV.
3. Coordenação opens the web RDV, starts review, corrects data with audited justification, approves and finalizes.
4. A finalized RDV may be reopened by Coordenação, reviewed/corrected and finalized again.
5. Daily XML export includes only finalized RDVs for the selected operational date.
6. Export fails closed when a finalized flight lacks required external identifiers or complete operational stage clocks.

## Rollback
Use the governed D1 recovery point if atomic apply fails. After a successful additive apply, application rollback leaves the unused nullable columns in place until a separately reviewed forward compensation; do not drop columns ad hoc.
