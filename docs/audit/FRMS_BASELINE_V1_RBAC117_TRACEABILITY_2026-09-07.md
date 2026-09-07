# FRMS Baseline V1 — RBAC 117 traceability

Date: 2026-09-07
Scope: documentary traceability only. No formula, parameter, seed, runtime behavior, deployment or migration is changed by this artifact.

## Purpose

This note addresses the regulatory-traceability portion of issue #455 for `FDP_MAXIMO_HORAS` and `REPOUSO_MINIMO_HORAS` in `frms-helicopter-offshore-baseline-v1`.

The applicable official source located and reviewed is **RBAC 117, Emenda 01**, approved by ANAC Resolution 750/2024 and in force since 2024-08-01.

Official ANAC sources:

- RBAC index: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbha-e-rbac/rbac
- RBAC 117 EMD 01 PDF: https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf
- Resolution 750/2024: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2024/resolucao-750

## `FDP_MAXIMO_HORAS`

The baseline currently carries a single engineering parameter for maximum FDP. RBAC 117 EMD 01 does **not** define one universal maximum FDP for all operating conditions.

For operations under Appendix B, section **B117.7** requires use of **Table B.1**, which varies maximum duty duration by acclimatized start time and number of flight sectors. Table B.1 includes values ranging from 9 to 13 hours for minimum/simple crews, depending on start time and sectors. Section **B117.9** further reduces the applicable table limit by 1 hour for a crewmember in an unknown acclimatization state. Section **B117.11** permits specific increases for split duty subject to its conditions, and section **B117.17** defines limited extensions under unforeseen operational circumstances.

Therefore:

- `FDP_MAXIMO_HORAS = 11` must **not** be described as a transcription of a single RBAC 117 maximum;
- it is an internal conservative engineering/operational-policy limit unless and until the operator's approved FRMS/GRF framework maps the runtime decision to the full applicable regulatory table and conditions;
- the authoritative regulatory references for maximum duty are at least B117.7/Table B.1, B117.9, B117.11 and B117.17, according to applicability.

No numeric change is authorized or made here.

## `REPOUSO_MINIMO_HORAS`

For operations under Appendix B, section **B117.23** explicitly governs rest following duty.

Relevant rules include:

- **B117.23(a):** when duty does not exceed 12 hours, an acclimatized crewmember normally requires at least 12 hours of subsequent rest, plus the applicable time-zone component when three or more time zones are crossed;
- **B117.23(b):** when duty does not exceed 10 hours, subsequent rest may be reduced to not less than 10 hours only when all listed conditions are met;
- **B117.23(c):** when duty exceeds 12 hours, subsequent rest increases by twice the amount by which duty exceeded 12 hours, plus applicable time-zone adjustment;
- **B117.23(d):** when the calculated rest exceeds 14 hours, a reduction to not less than 14 hours is permitted only under the listed conditions.

Accordingly, `REPOUSO_MINIMO_HORAS = 12` is traceable as the ordinary minimum starting point for the acclimatized Appendix-B case in B117.23(a), but it is **not** a complete substitute for the conditional rest calculation in B117.23(b)-(d).

No numeric change is authorized or made here.

## Additional finding relevant to the existing audit

Section **B117.25(a)(4)** of RBAC 117 EMD 01 explicitly establishes helicopter accumulated flight-time limits of 93 hours in any 28 consecutive days and 930 hours in any 365 consecutive days. This means the baseline/audit characterization of the helicopter `930h/365d` value should be treated as directly traceable to RBAC 117 EMD 01 for Appendix-B applicability, rather than only as an internal margin over a generic statutory ceiling. Any broader labor-law or collective-agreement constraints remain a separate layer and should not be inferred away.

This note does not itself rewrite the historical baseline review; it records the current authoritative ANAC traceability so a later governed documentation cleanup can reconcile the older wording without altering historical numeric behavior.

## Remaining blocker from issue #455

This artifact resolves only the ANAC/RBAC-source identification portion. It does **not** resolve the offshore-source provenance for:

- `REPOUSO_PLATAFORMA_*`;
- `CICLO_EMBARCADO_*`.

No authoritative public source has been accepted in this review for the existing 3h/6h platform-rest values or the 15-day embarked-cycle values. They must remain classified as undocumented offshore benchmark / operational-policy values until the applicable IOGP, Petrobras, contract, operator manual or other authoritative source is identified and reviewed.

Do not close issue #455 until that offshore provenance is established and the review evidence required by the issue is complete.
