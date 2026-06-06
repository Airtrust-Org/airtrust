# FRMS Accumulated Columns 7d/365d Audit — 2026-06-05

## Problem Observed

On the FRMS monthly table for June 2026, columns `7 DIAS` and `365 DIAS` showed `0h00` for all crew members, while `MÊS` showed correct values.

**Example:**
| Tripulante | MÊS | 7 DIAS | 365 DIAS |
|---|---|---|---|
| Dieter | 40h01 | 0h00 | 0h00 |
| Paloma | 25h37 | 0h00 | 0h00 |
| Karl | 20h34 | 0h00 | 0h00 |
| Marinho | 20h34 | 0h00 | 0h00 |
| La Rocque | 14h24 | 0h00 | 0h00 |
| Gabriel | 5h27 | 0h00 | 0h00 |
| Ramos | 5h27 | 0h00 | 0h00 |
| Ramon | 0h17 | 0h00 | 0h00 |
| Caio | 0h17 | 0h00 | 0h00 |

## Root Cause

**File:** `worker-airtrust/src/lib/frms/db-service-acumulo.ts`  
**Function:** `buscarAcumuloFrota` — month mode path (`if (mesReferencia)`)

Two issues:

### 1. `hv_365d_min` and `pct_365d` hardcoded to 0 (lines 572-573, pre-fix)

```typescript
hv_365d_min: 0,    // ← HARDCODED
pct_365d: 0,       // ← HARDCODED
hv_dia_min: 0,     // ← HARDCODED
pct_dia: 0,        // ← HARDCODED
```

The 365-day and daily accumulations were never computed — they were literal zeros, regardless of actual data.

### 2. `hv_7d_min` window was end-of-month based (line 509, pre-fix)

```typescript
const seteDiasInicio = dateOffset(periodoFim, -6);
// For June 2026: periodoFim = '2026-06-30', seteDiasInicio = '2026-06-24'
// June 24-30 is in the FUTURE → no jornada data → sum = 0
```

The 7-day window was computed from the end of the selected month, not from today. For the current month, dates near the end haven't happened yet.

## Fix Applied

### Approach

Instead of computing 7d from jornadas scoped to the selected month, we now LEFT JOIN the latest `frms_acumulo_rolling` snapshot per tripulante. This table already has pre-computed rolling values (`hv_365_dias_min`, `hv_7_dias_min`, `hv_dia_min`) sourced from SIGVOOS canonical operational data.

### SQL Change

Added a correlated subquery to get the latest rolling row:

```sql
LEFT JOIN frms_acumulo_rolling ar ON ar.tripulante_id = t.tripulante_id
  AND ar.id = (
    SELECT ar2.id
    FROM frms_acumulo_rolling ar2
    WHERE ar2.tripulante_id = t.tripulante_id AND ar2.deleted_at IS NULL
    ORDER BY ar2.data_referencia DESC, ar2.id DESC
    LIMIT 1
  )
```

### Result Mapping Change

Replaced hardcoded zeros with actual rolling table values:

```typescript
hv_365d_min: hv365dMin,    // from ar.hv_365_dias_min
pct_365d: pct365d,         // from ar.pct_limite_365d
hv_7d_min: hv7dMin,        // from ar.hv_7_dias_min
pct_7d: pct7d,             // from ar.pct_limite_7d
hv_dia_min: hvDiaMin,      // from ar.hv_dia_min
pct_dia: pctDia,           // from ar.pct_limite_dia
```

Also expanded `pctMax` calculation to include 365d and dia:

```typescript
const pctMax = Math.max(pctMes, pct7d, pct365d, pctDia);
```

## Evidence (SELECT Read-Only)

D1 production query confirmed `frms_acumulo_rolling` has correct data for all reported tripulantes on 2026-06-05:

| Tripulante | hv_7_dias_min | hv_365_dias_min | pct_limite_365d |
|---|---|---|---|
| Dieter | 864 (14h24) | 6,091 (101h31) | 10.92% |
| Paloma* | 1,361 (22h41) | 4,439 (73h59) | 7.96% |
| Karl | 1,234 (20h34) | 7,623 (127h03) | 13.66% |
| Marinho | 1,234 (20h34) | 3,709 (61h49) | 6.65% |
| La Rocque | 864 (14h24) | 6,918 (115h18) | 12.40% |
| Gabriel | 327 (5h27) | 3,798 (63h18) | 6.81% |
| Ramos | 327 (5h27) | 2,166 (36h06) | 3.88% |
| Ramon | 17 (0h17) | 32 (0h32) | 0.06% |
| Caio | 17 (0h17) | 17 (0h17) | 0.03% |

*Paloma's latest rolling data: 2026-05-30 (no jornada on June 5 → latest available snapshot used)

## Data-Base Rule

- **MÊS column**: Sum of `horas_voo_minutos` from `frms_jornada` within the selected month period (unchanged).
- **7 DIAS column**: `hv_7_dias_min` from the latest `frms_acumulo_rolling` snapshot (pre-computed 7-day rolling window from SIGVOOS).
- **365 DIAS column**: `hv_365_dias_min` from the latest `frms_acumulo_rolling` snapshot (pre-computed 365-day rolling window from SIGVOOS).

Source consistency: All three columns now use SIGVOOS as the canonical operational source (via `frms_acumulo_rolling` which is rebuilt from SIGVOOS data).

## Endpoint/Tela Affected

- **Route:** `GET /api/frms/acumulo-frota?mes=YYYY-MM`
- **Page:** FRMS Dashboard monthly table (`FrmsTripulantesTable` component)
- **Hook:** `useFrmsFrota(mes)` → calls acumulo-frota

## Tests Added

**File:** `worker-airtrust/src/__tests__/frms/acumulo-frota-rolling-fields.test.ts` (6 tests)

1. Rolling fields propagated correctly (not hardcoded to 0)
2. Fallback to 0 when rolling table has no data (safe degradation)
3. `nivel_max` considers 365d and dia in addition to mês and 7d
4. Tripulantes without jornadas in the month are excluded (HAVING > 0)
5. Multiple jornadas summed correctly for hv_mes_min
6. Quinzena Q1 filter works correctly

## Validations

- ✅ `npx tsc --noEmit` — passed
- ✅ `npm run build` — passed
- ✅ `npm run test:worker` — 918 tests passed (912 existing + 6 new)
- ✅ `npm run lint` — passed (api-base + secrets + auth boundaries)
- ✅ `git diff --check` — passed (no whitespace issues)

## Risk Remaining

- **Low**: The correlated subquery in the LEFT JOIN may be slightly slower than the previous query for large fleets (mitigated: fleet size is typically <200 tripulantes, and SQLite handles correlated subqueries with LIMIT 1 efficiently).
- **Data freshness**: If a tripulante has no recent `frms_acumulo_rolling` entries (e.g., their last rolling snapshot is several days old), the 7d and 365d values may be slightly stale. This is acceptable — it reflects their last known state.
- **Paloma edge case**: Her latest rolling snapshot is from May 30. If she has June jornadas, she'll appear in the June view with rolling data from May 30. This is correct behavior given available data.

## Confirmation

- ❌ No migration executed
- ❌ No database writes (read-only investigation + code fix)
- ✅ SELECT read-only on D1 remote for verification
- ✅ Frontend requires no changes (API contract preserved)
- ✅ Backend-only fix in `db-service-acumulo.ts`

## Commit

```
fix(frms): correct 7d and 365d accumulated flight hours in month view

The month mode of buscarAcumuloFrota hardcoded hv_365d_min, pct_365d,
hv_dia_min, and pct_dia to 0, and computed hv_7d_min against an
end-of-month window that is in the future for the current month.

Fix: LEFT JOIN the latest frms_acumulo_rolling snapshot per tripulant,
which already has correctly computed rolling values from SIGVOOS
canonical data. This makes 7d/365d/dia columns consistent with the
rolling mode and the heatmap.
```
