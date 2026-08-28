# FRMS Operational Load V1 — `OPERATIONAL_POLICY_V1`

## Purpose

Operational workload (number of landings/sectors) and the thermal environment are
recognised fatigue factors:

- ICAO FRMS guidance treats operational workload as a fatigue factor and
  recognises sectors/segments as relevant.
- IOGP 690-2 asks for additional restrictions on particularly demanding
  operations, including multiple short offshore shuttles and extreme
  temperatures.
- Short-haul literature links sector count to workload and fatigue.
- The thermal environment can raise physiological and cognitive load.

Until now AirTrust **collected** landings and weather evidence but did not let
them change the canonical effectiveness score. Operational Load V1 makes that
contribution explicit, versioned and auditable.

## Policy status — these are internal coefficients

`OPERATIONAL_LOAD_POLICY_V1` (`operational-load.ts`) holds AirTrust **internal
policy values**, approved by the system owner after a scientific benchmark. They
are **not** prescribed by ICAO or IOGP. They are:

- **internal** — an AirTrust operational policy, not a regulatory value;
- **versioned** — any change to a number bumps `OPERATIONAL_LOAD_POLICY_V1.version`;
- **conservative** — small deductions, combined floor of −6 points;
- **subject to re-calibration** against PVT, KSS and longitudinal AirTrust data.

## Model

### Landings — source: SIGVOOS

`pousos_diurnos + pousos_noturnos`, **deduplicated by physical leg** (distinct
`cv_voo_etapas.id`), so two crew rows for the same leg are never double-counted.

| Landings | Delta (points) |
|---|---|
| 0–2 | 0 |
| 3 | −1 |
| 4 | −2 |
| 5 | −3 |
| ≥ 6 | −4 |

There is **no separate night-landing penalty**: night exposure is already
captured by the circadian component and adding a second deduction would double
count it.

### Temperature — source: observed METAR / SPECI (REDEMET)

Max **observed** ambient temperature associated with the operation, taken from
the REDEMET/IOGP evidence pipeline (`frms_jornada_avaliacoes.environmental_json`,
`maxAmbientTempC`, only when `weatherSource` is `DECEA_REDEMET` or `MIXED`).

| Max observed temperature | Delta (points) |
|---|---|
| < 30 °C | 0 |
| 30 – 31.9 °C | −0.5 |
| 32 – 33.9 °C | −1.0 |
| 34 – 35.9 °C | −1.5 |
| ≥ 36 °C | −2.0 |

**Missing METAR is never treated as 0 °C or as comfortable.** When there is no
observed temperature: `temperature_max_c = null`, thermal delta = 0,
`weather_evidence_quality = 'INCOMPLETE'`, `data_quality = 'INCOMPLETE'`. TAF is
never used as observed weather for a retrospective analysis.

### Combined

```
operational_load_total_delta = max(-6, landings_delta + temperature_delta)
```

## Effectiveness integration

The canonical model sums signed **fractions** (−0.10 = −10 points):

```
effectiveness = 100
  + processo_s
  + processo_c
  + repouso
  + duração
  + horas_voo
  + carga_operacional        ← new: operational_load_total_delta / 100
```

`calcEffectiveness(fatorização, limites, jornada?, operationalLoad?)` — the
fourth argument is optional; when it is absent the result is byte-identical to
the previous contract. `componentes.carga_operacional` and a full
`operational_load` breakdown are added to `EffectivenessResult`.

## Persistence

`recalcularPipeline` resolves landings + observed temperature per journey and
persists the breakdown:

- inside `effectiveness_componentes_json` (`operational_load` object), and
- in dedicated `frms_fatorizacao_jornada` columns (migration **0476**):
  `operational_load_policy_version`, `operational_load_landings_count`,
  `operational_load_temperature_max_c`, `operational_load_weather_quality`,
  `operational_load_data_quality`, `operational_load_landings_delta`,
  `operational_load_temperature_delta`, `operational_load_total_delta`.

Convergence: landings are available immediately from SIGVOOS. Observed
temperature comes from the persisted IOGP evidence snapshot, so on the first
recompute after a fresh SIGVOOS import it may lag by one pipeline cycle; the next
recompute picks it up. A resolver failure never interrupts the canonical
recompute (falls back to no operational load).

## Explainability

`describeOperationalLoadV1()` and `FrmsEffectivenessPanel` render, for example:

```
Carga operacional: -3,0
  • 4 pousos: -2,0
  • temperatura máxima 32 °C: -1,0
```

or, without observed weather:

```
Carga operacional: -2,0
  • 4 pousos: -2,0
  • temperatura: evidência meteorológica indisponível (0)
```

## Not changed

Recovery (`frms_recovery_*`) is a separate dimension. Its
`effectiveness_delta_pct` stays `NULL` — Operational Load V1 does not touch it.
