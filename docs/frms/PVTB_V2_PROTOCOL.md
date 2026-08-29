# FRMS Vigilance Test — `airtrust-pvtb-v2`

## What changed and why

The first vigilance protocol (`airtrust-vigilance-v1`) used a reddish square with
a **blue dot** stimulus and a 2–10 s inter-stimulus interval. The wording still
told the crew member to "click when the blue circle appears". That mixed the
PVT-B *duration* with the *classic PVT* interval and did not provide a visually
recognisable PVT presentation.

`airtrust-pvtb-v2` is an independent AirTrust implementation of the PVT paradigm.
It uses the brief PVT-B timing/sampling approach and the familiar computer-PVT
visual convention: a black response field, a fixed red rectangular outline, and
a yellow millisecond counter as the stimulus.

Scientific and operational references:

- NASA Ames Research Center — Fatigue Countermeasures Laboratory / NASA PVT+:
  <https://www.nasa.gov/human-systems-integration-division/human-performance/fatigue-countermeasures-laboratory/>
- Basner, M., Mollicone, D., & Dinges, D. F. (2011). *Validity and sensitivity
  of a brief psychomotor vigilance test (PVT-B)*. **Acta Astronautica**, 69(11–12),
  949–959.
- PsyToolkit experiment library — PVT-B (secondary reproducible implementation):
  <https://www.psytoolkit.org/experiment-library/pvtb.html>

NASA Ames maintains validated PVT implementations for operational research,
including aviation. The AirTrust test is **not** the NASA PVT+ application and
does not claim to reproduce that application's interface pixel-for-pixel. NASA
is cited in the crew-facing UI only as a concise scientific/operational reference;
the detailed methodological provenance remains in this technical documentation.

## Protocol (`PVTB_V2_PROTOCOL`)

| Parameter | Value |
|---|---|
| Session sampling duration | ~3 minutes (`180000 ms`) |
| Response surface | **black field**, active for pointer/keyboard response |
| Fixed visual frame | **red rectangular outline**, visible throughout the session |
| Waiting state | black field + empty red rectangle |
| Stimulus | **yellow millisecond counter** inside the red rectangle |
| Counter refresh | ~every 50 ms (`counterTickMs`) — display only |
| Response | tap/click/space/enter as fast as possible |
| Inter-stimulus interval | ~1 s feedback hold + random 0–3 s = **1–4 s total** |
| Lapse | reaction time ≥ 500 ms |
| False start / anticipation | reaction time < 100 ms, or any tap with no counter shown |
| Response window | up to **30000 ms** after a presented stimulus |
| No response | recorded as a **lapse with RT = 30000 ms**, not as a separate `missed` event |
| Timing source | `performance.now()` only — never `Date.now()` |
| Focus / visibility loss | invalidates the attempt; no partial data is emitted |

The whole black response surface remains clickable/tappable so the measurement
is not made unnecessarily dependent on pointing precisely at a small target.
The red rectangle is the visual fixation/stimulus frame; it is not the only
accepted response target.

The three-minute value is the **stimulus sampling window**. No new trial is
started after that boundary. If a stimulus was already visible when the boundary
is reached, that trial is allowed to resolve normally: the crew member may respond,
or the 30-second response ceiling may expire. The persisted session duration
remains the nominal sampling duration, while the last trial retains its real
reaction-time semantics. This prevents a stimulus shown at the end of the test
from being silently discarded or reclassified only because the global clock
crossed 180 seconds.

Feedback is display-only. It never mutates the measured reaction time or the
trial outcome. Reaction times are always reported in **milliseconds** —
microseconds are deliberately not shown because the browser, display and human
response do not support that precision.

## Server-side normalization

The Worker does not trust client-provided labels or reaction times. It rebuilds
outcomes from monotonic timestamps and the submitted `protocol_version`.

For `airtrust-pvtb-v2`:

- a presented stimulus with `responseAtMs = null` normalizes to `lapse` with
  `reactionTimeMs = 30000`;
- a response after the nominal 180-second sampling boundary is accepted when the
  stimulus itself was presented inside the sampling window, up to the 30-second
  PVT-B response ceiling;
- an anticipation remains a false start;
- a response ≥500 ms remains a lapse.

For historical `airtrust-vigilance-v1`, the old no-response interpretation is
preserved. The two protocols are not mixed.

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

- Lapse (≥ 500 ms) and false-start (< 100 ms) thresholds remain the readiness
  thresholds used by AirTrust.
- The readiness scoring / classification rules (`deriveReadinessAssessment`) are
  unchanged; the protocol revision changes the stimulus presentation, interval,
  and no-response handling.
- The PVT result still never decides APTO/INAPTO on its own.
