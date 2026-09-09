# FRMS Baseline V1 — source-classification decision

Date: 2026-09-07  
Scope: provenance/governance only  
Runtime change: none  
Parameter-value change: none

## Purpose

This decision reconciles the legacy classification language in `FRMS_PARAMETER_BASELINE_AUDIT.md` with the authoritative-source review recorded in `docs/audit/FRMS_BASELINE_V1_RBAC117_TRACEABILITY_2026-09-07.md`.

It does **not** approve any parameter value for operational use. It classifies what can and cannot currently be claimed about the provenance of the values.

## Source hierarchy reviewed

The review separated four layers that must not be conflated:

1. ANAC operational regulation — RBAC 117 / RBAC 135 as applicable;
2. Lei 13.475/2017 and other applicable statutory labor rules;
3. collective instruments — including the signed Costa do Sol Táxi Aéreo ACT 2025/2027 and historical SNA/SNETA Taxi-Air CCT 2023/2025;
4. operator/customer/offshore policy — including any Petrobras, IOGP or contract requirement only when a specific authoritative source is identified.

## Corrected provenance decisions

| Parameter | Current value | Defensible source classification | Decision |
|---|---:|---|---|
| `FDP_MAXIMO_HORAS` | 11 h | `OPERATIONAL_POLICY_WITH_REGULATORY_CONTEXT` | RBAC 117 does not establish one universal 11 h maximum. B117.7/Table B.1 and related provisions vary the applicable FDP. Do not label 11 h as a direct transcription of RBAC 117. |
| `REPOUSO_MINIMO_HORAS` | 12 h | `REGULATORY_CONTEXT_BASELINE` | 12 h is traceable to the ordinary B117.23(a) case, but B117.23(b)-(d) contain conditional calculations. The constant is not a complete implementation of the regulation. |
| `HV_28_DIAS_HORAS` | 93 h | `REGULATORY` | RBAC 117 EMD 01 B117.25(a)(4) explicitly establishes 93 h/28 consecutive days for helicopter operations under the applicable appendix. |
| `HV_365_DIAS_HORAS` | 930 h | `REGULATORY` | RBAC 117 EMD 01 B117.25(a)(4) explicitly establishes 930 h/365 consecutive days for helicopter operations under the applicable appendix. The older characterization of 930 h solely as an internal margin over 960 h must not be used as the current provenance statement. |
| `REPOUSO_PLATAFORMA_MINIMO_HORAS` | 3 h | `REGULATORY_CONTEXT_BASELINE` | Lei 13.475/2017 art. 38(I) establishes, for the applicable Article 5(II), (IV) and (V) services with minimum/simple crew, an interruption of duty outside the contractual base **superior to 3 h and inferior to 6 h**, provided the required rest accommodation is supplied. The legacy parameter name must not be presented as post-duty "rest". |
| `REPOUSO_PLATAFORMA_MAXIMO_HORAS` | 6 h | `REGULATORY_CONTEXT_BASELINE` | Same Article 38(I) context. The 6 h threshold is **exclusive**; Article 38(II) separately addresses interruptions above 6 h and below 10 h under stronger accommodation conditions. This pair is therefore not a universal offshore-rest rule. |
| `CICLO_EMBARCADO_DIA_MAX` | 15 days | `UNVERIFIED_OPERATIONAL_POLICY` | The Costa do Sol ACT provides mission-roster maxima but does not mandate a universal 15-day cycle. No reviewed IOGP/Petrobras source establishes 15 days as an external requirement. |

## Meaning of `UNVERIFIED_OPERATIONAL_POLICY`

This label is deliberately fail-closed. It means:

- the numeric value exists in the legacy model and remains preserved for historical equivalence;
- no authoritative external source reviewed to date proves that exact number is legally, contractually or industry-mandated;
- the value must not be presented to a customer, auditor or regulator as an RBAC/CCT/ACT/IOGP/Petrobras requirement;
- preserving the historical number is **not** approval of the number for future operational policy;
- changing it requires a new governed revision, rationale, tests and the normal approval path;
- tenant-specific collective or contractual rules must not be promoted into universal defaults.

## Costa do Sol collective-instrument consequence

The signed Costa do Sol Táxi Aéreo ACT 2025/2027 is authoritative for the labor matters it expressly addresses for that operator. Its mission-roster framework includes maxima of 21 consecutive mission days and 17 consecutive effective-work days at the operational location, together with the instrument's leave rule and roster-publication requirements.

Those provisions do **not** prove the AirTrust 15-day fatigue-model constant and do **not** establish the 3 h/6 h platform-rest pair. They must be modeled as a separate tenant/applicability layer if the product later enforces them directly.

## Official statutory cross-check: interruption is not reserve or post-duty rest

The official text of Lei 13.475/2017 distinguishes **interrupção de jornada** (Article 38), **reserva** (Article 44) and **repouso pós-jornada** (Articles 46–48). The legacy `REPOUSO_PLATAFORMA_*` names correspond most closely to the Article 38 interruption window, not to reserve or post-duty rest.

- Article 38(I) applies to Article 5(II), (IV) and (V) services, including taxi-air service, when using minimum/simple crew, and requires an interruption **greater than 3 h and less than 6 h** plus the specified accommodation.
- Article 38(II) separately covers interruption **greater than 6 h and less than 10 h** with individual rooms and stronger accommodation conditions.
- Article 44 sets different reserve limits and must not be used as the source for this pair.
- Articles 46–48 define post-duty rest and likewise must not be conflated with the legacy parameter name.
- Article 41, paragraphs 2–4 separately establishes the 21-day mission / 17-day work-at-location outer framework and the corresponding post-mission leave calculation for Article 5(II)–(V); this is not a fixed 15-day fatigue cycle.

Official source: [Lei 13.475/2017, arts. 41 and 44](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm).

Therefore, the legacy 3 h/6 h pair numerically resembles the **reserve** range for a different service category. It is neither evidence of taxi-air reserve (3–10 h) nor evidence of offshore platform rest. This is a possible historical conflation, not a basis to relabel or change either number without a new approved governed revision.

## IOGP consequence

The reviewed IOGP 690-2 fatigue-management material supports general offshore aviation fatigue controls, including FDP/rest concepts and the need for additional restrictions in demanding operations. The material reviewed does not establish the AirTrust-specific 15-day or 3 h/6 h values.

Therefore no `IOGP_690_2` citation should be attached to those exact numeric constants unless a specific section in an authoritative revision is later identified and reviewed.

## Release/governance consequence

This decision resolves the **misclassification risk**: undocumented legacy values are no longer to be treated as externally sourced merely because they look plausible for offshore operations.

It does not by itself close issue #455. Before treating the V1 baseline as a complete compliance artifact for real operational decision-making, one of the following must occur for the unresolved values:

1. an authoritative operator/customer/contract source is identified and mapped to the exact values; or
2. the operator formally approves them as internal policy in a new governed source/revision; or
3. the runtime decision is redesigned so these legacy fatigue-model parameters are clearly separated from enforceable regulatory/labor constraints.

Until then, historical equivalence may be demonstrated, but compliance provenance for the 15-day and 3 h/6 h numbers remains fail-closed.

### Runtime enforcement added after the provenance review

The persisted baseline remains unchanged for audit/history, including `CICLO_EMBARCADO_DIA_MAX=15` and `CICLO_EMBARCADO_ATIVO=1`. Runtime use is now separated from storage provenance:

- revisions classified as `INTERNAL_POLICY`, `UNVERIFIED_OPERATIONAL_POLICY`, regulatory context, or any other source type do **not** authorize the 15-day embarked-cycle penalty by themselves;
- the factor is operationally enabled only when a new immutable governed revision is explicitly classified as `APPROVED_OPERATIONAL_POLICY`;
- that classification still requires the normal tenant-scoped admin flow, source reference, reason, effective date, audit trail and recalculation ledger;
- the approval marker is runtime metadata, not a persisted numeric parameter, so historical parameter rows are not rewritten and restore/history remain exact.

This closes the unsafe-default path without asserting that 15 days is a legal, CCT, IOGP or Petrobras limit.
