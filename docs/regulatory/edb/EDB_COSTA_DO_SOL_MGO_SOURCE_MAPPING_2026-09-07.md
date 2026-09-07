# eDB — Costa do Sol MGO source mapping for IFR and cycles

Date: 2026-09-07  
Issue: #91  
Runtime change: none

## Reviewed operator source

Internal operator manual reviewed from the governed project source set:

- `MNL-OPS-001 - MGO - Rev14.pdf`
- document identification: MNL-OPS-001, MGO, Revision 14, dated 2025-10-17;
- Section 10 — Diário de Bordo;
- relevant filling instruction appears in the current manual around Section 10.2, page 10-6 of the manual content.

The manual also states that the Costa do Sol electronic logbook is the LOGBOOK system approved by ANAC and that the detailed eDB filling instruction is ITR-OPS-032.

## IFR source semantics — resolved for the operator model

The MGO explicitly separates instrument-flight time in the Diário de Bordo into:

- `IFR-R`: IFR **real**;
- `IFR-C`: IFR **sob capota** (simulated instrument conditions).

This gives an operator-authoritative semantic mapping for the two distinct eDB fields required by Resolução ANAC 773/2025:

| Costa do Sol source | AirTrust regulatory-domain field |
|---|---|
| IFR-R | `tempo_ifr_real_minutos` / `ifrActualMinutes` |
| IFR-C (sob capota) | `tempo_ifr_simulado_minutos` / `ifrSimulatedMinutes` |

The existing AirTrust explicit regulatory-source contract already has separate fields for these values. Therefore no domain-model redesign is required merely to represent the MGO semantics.

## Legacy `tempo_ifr` remains unclassified

This source mapping does **not** authorize reinterpretation of the existing aggregate SIGVOOS/legacy `tempo_ifr` field.

Unless the upstream source proves whether each minute was IFR-R or IFR-C, the legacy aggregate must continue to be preserved only as `tempo_ifr_nao_classificado_minutos` / `ifrUnclassifiedMinutes` and must not satisfy either regulatory field.

A future adapter may populate actual/simulated IFR only from a source that preserves the MGO classification explicitly, for example the approved LOGBOOK/eDB export or another operator-controlled structured source with equivalent provenance.

## Cycles — operator manual evidence found, but not sufficient for eDB aircraft-cycle projection

The MGO uses the word **ciclo** in its flight-crew recent-experience rules and expressly describes an offshore recency cycle as a sequence of takeoff, circuit and landing. It also refers to aircraft/maintenance historical records in hours and/or cycles.

Those statements prove that Costa do Sol uses documented cycle concepts, but they do **not** establish that the crew-recency cycle definition is the same quantity required in every aircraft/engine maintenance or regulatory eDB context.

Accordingly:

- do not map `starts` to cycles;
- do not map landing count to cycles;
- do not use the MGO crew-recency cycle definition as a universal aircraft/engine cycle rule;
- keep `cycles = null` until the applicable aircraft/engine/operator maintenance source identifies the exact counted event for the target eDB record.

The likely authoritative next source is the operator maintenance program / aircraft status source or manufacturer maintenance definition referenced by the applicable maintenance control system.

## Effect on issue #91

The IFR portion of #91 is now semantically resolved at operator-policy level:

- required source distinction: known;
- AirTrust target fields: already modeled;
- legacy aggregate: correctly remains fail-closed.

The remaining substantive blocker is the explicit **cycles** source/rule and, operationally, access to a structured source that actually carries IFR-R and IFR-C separately. No production write, migration or external transmission is required for this documentary decision.
