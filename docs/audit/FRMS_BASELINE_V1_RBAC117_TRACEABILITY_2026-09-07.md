# FRMS Baseline V1 — regulatory and collective-labor traceability

Date: 2026-09-07
Scope: documentary traceability only. No formula, parameter, seed, runtime behavior, deployment or migration is changed by this artifact.

## Purpose

This note addresses the regulatory-traceability portion of issue #455 for `FDP_MAXIMO_HORAS`, `REPOUSO_MINIMO_HORAS`, `REPOUSO_PLATAFORMA_*` and `CICLO_EMBARCADO_*` in `frms-helicopter-offshore-baseline-v1`.

It separates four distinct normative layers that must not be collapsed into one source:

1. ANAC operational regulation (RBAC 117 and RBAC 135 as applicable);
2. Lei 13.475/2017 (Lei do Aeronauta);
3. collective bargaining instruments applicable to taxi-air aeronauts;
4. operator/customer/offshore policy and contractual requirements.

There is no applicable "RBAC 134" identified for Brazilian taxi-air operations in this review. ANAC's current regulatory material treats taxi-air / non-scheduled on-demand operations under **RBAC 135**. References to "RBAC 134" in this context must therefore be treated as a nomenclature error unless an authoritative source proving otherwise is supplied.

## Official ANAC source — RBAC 117

The applicable official source located and reviewed is **RBAC 117, Emenda 01**, approved by ANAC Resolution 750/2024 and in force since 2024-08-01.

Official ANAC sources:

- RBAC index: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbha-e-rbac/rbac
- RBAC 117 EMD 01 PDF: https://pergamum.anac.gov.br/pergamum/vinculos/RBAC117EMD01.pdf
- Resolution 750/2024: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2024/resolucao-750
- RBAC 135 / taxi-air regulatory context: https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/taxi-aereo/revisao-135

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

## Additional RBAC 117 finding — helicopter accumulated flight time

Section **B117.25(a)(4)** of RBAC 117 EMD 01 explicitly establishes helicopter accumulated flight-time limits of 93 hours in any 28 consecutive days and 930 hours in any 365 consecutive days. This means the baseline/audit characterization of the helicopter `930h/365d` value should be treated as directly traceable to RBAC 117 EMD 01 for Appendix-B applicability, rather than only as an internal margin over a generic statutory ceiling.

Any broader labor-law or collective-agreement constraints remain a separate layer and must not be inferred away.

## Taxi-air collective bargaining layer

### Sector CCT status

The latest **signed sector CCT published in the SNA legal-document index** is the SNA/SNETA Taxi-Air CCT 2023/2025, whose stated term was 2023-12-01 through 2025-11-30. It covered aeronauts operating non-scheduled air transport nationwide and expressly identified offshore commander/copilot as helicopter crewmembers operating for the oil-and-gas chain to maritime platforms and ships.

Source:

- SNA legal documents index: https://www.aeronautas.org.br/leis-e-documentos/
- signed CCT 2023/2025: https://aeronautas.org.br/wp-content/uploads/2024/07/CCT-SNA-X-SNETA-2023-2025-site.pdf

The attempted sector renewal for 2025/2027 must **not** be treated as a signed effective CCT on the evidence reviewed here. SNA records show that the proposal was rejected and that the subsequent collective-dispute process remained contested during 2026. The rejected draft is evidence of negotiation history only, not an operative source for FRMS limits.

Relevant SNA history:

- https://aeronautas.org.br/taxi-aereo-em-votacao-aeronautas-associados-reprovam-renovacao-da-cct-2025-2027/
- https://www.aeronautas.org.br/cct-taxi-aereo-2025-27-aeronautas-reprovam-prosseguimento-do-dissidio-coletivo/

### What the expired sector CCT demonstrates

Clause 8 established 44 weekly / 176 monthly hours for the covered regime, with specified counted activities. Clause 9 established a **mission roster** framework with:

- maximum 21 consecutive days in the mission period;
- no more than 17 consecutive days of effective work at the operational location;
- rest/leave after such mission equal to the consecutive effective-work period at the location minus 2 days;
- the weekly 44-hour ceiling not applying to that mission-roster population, while the 176-hour monthly ceiling remained absolute;
- monthly mission rosters with operational bases and days off published at least 20 days in advance, subject to the stated unforeseen-service exception.

These provisions are useful historical/sector context but, because the document's term ended on 2025-11-30, they must not by themselves be asserted as the current labor source for a specific operator in September 2026.

## Current Costa do Sol operator-specific ACT

For the Costa do Sol tenant, the SNA currently publishes a signed **Costa do Sol Táxi Aéreo ACT 2025/2027**, effective through 2027-11-30. This is the most directly applicable collective-labor source identified in this review for that operator.

Source:

- SNA legal documents index: https://www.aeronautas.org.br/leis-e-documentos/
- signed Costa do Sol ACT: https://aeronautas.org.br/wp-content/uploads/2026/01/ACT-Costa-do-Sol-2027.pdf

Relevant provisions reviewed:

- **Clause 8:** 44 weekly / 176 monthly hours for the general covered regime and the listed counted activities.
- **Clause 9:** for Costa do Sol mission-roster aeronauts, maximum 21 consecutive mission days, maximum 17 consecutive effective-work days at the operational location, and leave equal to effective-work days at the location minus 2 days. For this mission-roster population the weekly 44-hour limit does not apply, but the 176-hour monthly ceiling may not be exceeded.
- **Clause 9:** Costa do Sol must publish monthly mission rosters, including operational bases and days off, at least 20 days in advance, subject to the instrument's unforeseen-service exception.
- **Clause 79 (prevalence):** the ACT prevails for matters expressly addressed by it, within the terms stated in the instrument; omissions/lacunae fall back to applicable legal norms and prior agreements insofar as they do not conflict with the ACT.
- **Clause 80 (more favorable CCT):** if a later SNA/SNETA CCT establishes more beneficial economic/social conditions, those conditions become applicable to aeronauts covered by the ACT from the CCT's effective date.

### Consequence for `CICLO_EMBARCADO_*`

The Costa do Sol ACT gives an authoritative **outer mission-roster framework**, but it does **not** establish a fixed universal 15-day embarked cycle. In particular, it states maxima of 21 consecutive mission days and 17 consecutive effective-work days at the operational location and defines the corresponding leave rule.

Therefore the current AirTrust 15-day `CICLO_EMBARCADO_*` value:

- may be a more conservative operator/customer/offshore policy;
- is not proven by this ACT as a normative 15-day requirement;
- must not be labelled as a direct transcription of the ACT or the expired sector CCT;
- requires a separate operator/customer/IOGP/Petrobras source if its **15-day value itself** is to be presented as externally mandated.

No numeric change is authorized or made here.

### Consequence for `REPOUSO_PLATAFORMA_*`

Neither the reviewed sector CCT nor the current Costa do Sol ACT provides a source for the baseline's 3-hour / 6-hour platform-rest parameter pair. The ACT references appropriate rest conditions in a specific night-work exception for aeromedical/maintenance activity, but this is not evidence for the FRMS platform-rest numeric values.

Therefore the 3h/6h values remain without accepted authoritative provenance in this review.

No numeric change is authorized or made here.

## Governance consequences

1. Regulatory, labor and operator/customer constraints must be represented as distinct provenance layers.
2. The engine should ultimately apply the **most restrictive applicable constraint** for the specific operator, roster regime and operational context, rather than treating one baseline constant as the entire legal rule.
3. Tenant-specific ACT rules, such as Costa do Sol Clause 9, must not silently become universal defaults for other operators.
4. A future signed SNA/SNETA CCT must be reviewed when published because Costa do Sol Clause 80 expressly provides for automatic application of more favorable later CCT conditions.
5. Historical/rejected CCT drafts must never be promoted into runtime normative parameters.

This note does not itself rewrite the historical baseline review or runtime model; it records current source traceability so a later governed documentation/model cleanup can reconcile the older wording without silently changing historical numeric behavior.

## Remaining blocker from issue #455

This artifact materially reduces #455 but does **not** fully close it.

Resolved/documented source layers:

- RBAC 117 traceability for FDP/rest and helicopter accumulated-flight limits;
- sector taxi-air CCT historical framework and its expiry/status;
- current Costa do Sol ACT mission-roster framework and precedence clauses.

Still unresolved:

- authoritative source for the **specific 15-day** `CICLO_EMBARCADO_*` value, if that value is claimed to be externally mandated rather than internal policy;
- authoritative source for the **3h/6h** `REPOUSO_PLATAFORMA_*` values;
- formal decision on whether the runtime model needs a future tenant-aware collective-rule layer rather than documentation-only provenance.

Do not close issue #455 until those remaining offshore provenance questions are resolved or the values are explicitly reclassified, approved and governed as internal operator policy.
