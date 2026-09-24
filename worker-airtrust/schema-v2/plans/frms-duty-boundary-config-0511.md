# frms-duty-boundary-config-0511

## Objective
Make FRMS duty-end rules tenant-configurable and remove ambiguous runtime inference from the daily fatigue calculation.

The daily fatigue check-in is the authoritative source for the crew-reported presentation time and sleep/wake evidence. This change adds only the two tenant-scoped duty-boundary settings required to convert that evidence plus operational flight shutdown data into a canonical duty duration.

## Parameters
- `jornada_pos_corte_minutos`: minutes added after the last engine shutdown/cutoff on a day with flight. Initial/default value: 30.
- `jornada_sem_voo_fim`: standard duty-end clock for a workday without flight. Initial/default value: 17:00.

Both values remain editable through the FRMS manager configuration surface and are audited on change.

## Safety and provenance
- Additive columns only on `frms_fadiga_config_empresa`.
- No historical journey, effectiveness or check-in row is rewritten by the migration.
- Runtime calculation fails closed when the daily check-in lacks presentation, wake or sleep evidence.
- The flight-day boundary uses the last operational cutoff preserved from SIGVOOS/FRMS, never an inferred presentation.
- Tenant isolation remains anchored by `empresa_id`; the update endpoint never accepts a tenant id from the client.
- Values are configuration data, not hardcoded runtime rules.

## Operational flow
1. Crew submits the daily fatigue check-in, including presentation, wake time and sleep/rest.
2. The canonical FRMS pipeline resolves the tenant-scoped duty-boundary configuration.
3. With flight, duty end = last cutoff + configured minutes.
4. Without flight, duty end = configured no-flight end clock.
5. Missing required evidence leaves effectiveness unavailable and surfaces an incomplete-data state.
6. Manager views the daily balance of effectiveness, workload, operational demand and recovery instead of ambiguous fortnight accumulators.

## Rollback
Capture the governed D1 recovery point before apply. If atomic apply fails, restore to that recovery point. After a successful additive apply, application rollback may stop consuming the two columns; do not drop columns ad hoc. Any schema reversal requires a separately reviewed forward compensation.
