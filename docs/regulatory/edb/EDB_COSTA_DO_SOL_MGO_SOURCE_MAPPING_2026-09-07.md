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

## Cycles — documented source review and applicability boundary

The following material was reviewed on 2026-09-07. It establishes that the word
`cycle` is context-specific; it does not supply a normal-flight counter that can
be projected into `draft.legs[].cycles`.

| Source | Exact location / revision | What it defines or requires | Applicability to normal eDB cycles |
| --- | --- | --- | --- |
| Costa do Sol MGO `MNL-OPS-001`, Rev. 14, dated 2025-10-17 | Section 10, page 10-5 (effective-page Rev. 13, dated 2025-06-27), item 10.2.5(a)(ii) | The PIC acknowledges maintenance information that may be available in hours, cycles or days. It does not define an aircraft-cycle event or an engine-cycle event. | Insufficient. |
| Costa do Sol MGO `MNL-OPS-001`, Rev. 14 | Section 2, page 2-8 (effective-page Rev. 06), item 2.3.5(a)(o); Section 4, page 4-9 (effective-page Rev. 11), recent-experience rule | Requires accuracy of flight hours, service cycles and discrepancies for maintenance, and defines an offshore crew-recency cycle as takeoff, circuit and landing. | The recency definition is crew-qualification-specific, not a maintenance or eDB aircraft/engine definition. |
| Leonardo AW139 RFM, Issue 2 Rev. 32, document `139G0290X002` | Supplement 13, Cargo Hook Operations, Section 1 — Limitations, PDF page 1403 in the reviewed copy | Defines an **external load cycle** as every external-load lift using the cargo hook and requires it in the helicopter log-book for cargo-hook operations. The reviewed copy itself says it is not contractually maintained by Leonardo. | Not applicable to ordinary flight legs; it cannot define a general airframe cycle and says nothing about engine-cycle counting. |
| P&WC PT6C-67C technical publications | Official P&WC Technical Publications service; current engine maintenance manual is obtained through MyP&WC Power Portal subscription | P&WC confirms that engine maintenance manuals and approved maintenance procedures are controlled publications. No applicable PT6C-67C manual, revision, task or counter definition was available in the governed operator source set. | Missing source; no engine-cycle rule can be asserted. |

This review therefore does **not** determine that a normal airframe cycle and a
normal engine cycle are the same, and it does not determine distinct definitions
for them either.  The only positive OEM definition found is a separate
external-load counter.  It would be unsafe to promote a crew-recency,
external-load, engine-start, landing, or other special-purpose count into either
maintenance counter.

Accordingly:

- do not map `starts` to cycles;
- do not map landing count to cycles;
- do not use the MGO crew-recency cycle definition as a universal aircraft/engine cycle rule;
- do not use the AW139 cargo-hook external-load definition for ordinary legs;
- keep `cycles = null` until the applicable operator maintenance program, aircraft-status source, or current OEM airframe/engine maintenance data identifies the exact counted event, the affected serial/engine, and the source revision.

The required next evidence is the Costa do Sol PMA/MGM or maintenance-control
procedure together with the applicable AW139 maintenance-planning data and
PT6C-67C engine manual/engine-status export.  That evidence must state whether
the counters are airframe or engine counters, their reset/baseline semantics,
and the structural source that AirTrust may consume.

## Effect on issue #91

The IFR portion of #91 is now semantically resolved at operator-policy level:

- required source distinction: known;
- AirTrust target fields: already modeled;
- legacy aggregate: correctly remains fail-closed.

The remaining substantive blocker is the explicit **cycles** source/rule and, operationally, access to a structured source that actually carries IFR-R and IFR-C separately. No production write, migration or external transmission is required for this documentary decision.
