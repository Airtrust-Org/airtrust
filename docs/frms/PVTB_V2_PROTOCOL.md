# FRMS Vigilance Test — `airtrust-pvtb-v2`

## What changed and why

The first vigilance protocol (`airtrust-vigilance-v1`) used a reddish square with
a **blue dot** stimulus and a 2–10 s inter-stimulus interval. The wording still
told the crew member to "click when the blue circle appears". That mixed the
PVT-B *duration* with the *classic PVT* interval and did not match the published
PVT-B paradigm visually.

`airtrust-pvtb-v2` aligns the AirTrust implementation with the published
**PVT-B** design:

- Basner, M., Mollicone, D., & Dinges, D. F. (2011). *Validity and sensitivity
  of a brief psychomotor vigilance test (PVT-B)*. **Acta Astronautica**, 69(11–12),
  949–959.
- PsyToolkit experiment library — PVT-B:
  <https://www.psytoolkit.org/experiment-library/pvtb.html>

This is an **independent AirTrust implementation of the published paradigm**. It
is **not** the NASA PVT+ application and the UI states that explicitly.

## Protocol (`PVTB_V2_PROTOCOL`)

| Parameter | Value |
|---|---|
| Session duration | ~3 minutes (`180000 ms`) |
| Fixed stimulus surface | a **red box**, visible the entire session |
| Waiting state | red box, empty |
| Stimulus | a **yellow millisecond counter** inside the box |
| Counter refresh | ~every 50 ms (`counterTickMs`) — display only |
| Response | tap/click/space/enter as fast as possible |
| Inter-stimulus interval | ~1 s feedback hold + random 0–3 s = **1–4 s total** |
| Lapse | reaction time ≥ 500 ms |
| False start / anticipation | reaction time < 100 ms, or any tap with no counter shown |
| Response window | counter climbs to 3000 ms; no response by then ⇒ `missed` |
| Timing source | `performance.now()` only — never `Date.now()` |
| Focus / visibility loss | invalidates the attempt; no partial data is emitted |

Feedback is display-only. It never mutates the raw trial time or the trial
`outcome`. Reaction times are always reported in **milliseconds** — microseconds
are deliberately not shown because the browser, display and human response do not
support that precision.

## Baseline isolation (v1 ⇄ v2)

Individual readiness baseline is computed **per `protocol_version`**:

- `frms_readiness_assessment.protocol_version` (existing column, migration 0472)
  now records `airtrust-pvtb-v2` for new sessions.
- `countReadinessBaselineSessions` / `getReadinessBaselineSnapshot` filter
  `AND protocol_version = ?`.
- Migration **0476** adds
  `idx_frms_readiness_baseline_protocol (empresa_id, funcionario_id,
  protocol_version, created_at) WHERE deleted_at IS NULL`.

Consequences:

- historical `airtrust-vigilance-v1` sessions are preserved and still readable;
- they **never** contribute to an `airtrust-pvtb-v2` baseline;
- each crew member rebuilds the 5-session baseline once on the new protocol; until
  then `classification = baseline_building`;
- `GET /api/frms/readiness/baseline` accepts `?protocol=` (defaults to the active
  protocol) and echoes `protocol_version`.

## Not changed

- Lapse (≥ 500 ms) and false-start (< 100 ms) thresholds are the same as v1.
- The readiness scoring / classification rules (`deriveReadinessAssessment`) are
  unchanged; only the stimulus paradigm and the ISI changed.
- The PVT result still never decides APTO/INAPTO on its own.
