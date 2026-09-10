# eDB — Costa do Sol source mapping for IFR and cycles

Original decision date: 2026-09-07  
Reconciled: 2026-09-10  
Issue: #91  
Runtime change: none

## Reviewed operator sources

- `MNL-OPS-001 - MGO - Rev14.pdf` — Manual Geral de Operações, Revision 14, Section 10 — Diário de Bordo.
- `MNL-MNT-001 - MGM - Rev10.pdf` — Manual Geral de Manutenção, Revision 10, dated 2025-10-24.

The MGO states that the Costa do Sol eDB uses the same flight-record fields/data as the physical DB and identifies `ITR-OPS-032 Preenchimento de Diário de Bordo Eletrônico` as the detailed eDB instruction.

## IFR source semantics

The MGO explicitly separates instrument-flight time into:

- `IFR-R`: IFR real;
- `IFR-C`: IFR sob capota / simulated instrument conditions.

AirTrust already has separate regulatory-domain fields for these values. Legacy unclassified `tempo_ifr` remains unclassified and must not be silently promoted to either field.

## Cycles — superseding source decision

The 2026-09-07 review correctly kept ordinary eDB flight cycles unresolved because the source set then reviewed did not contain an applicable maintenance definition. That source-set conclusion is superseded by the 2026-09-10 review of the Costa do Sol MGM Rev. 10.

The MGM provides the missing controlled operator-maintenance definition in Appendix 2, item A2.12, note 1:

> Etapa de voo é um ciclo de voo composto de uma decolagem e um pouso em sequência.

The same MGM also establishes that:

- the Diário de Bordo is the principal record for aircraft flight hours and cycles;
- every Costa do Sol flight is recorded with hours, landings and cycles;
- CTM transfers flight hours, cycles and landings from the Diário de Bordo into maintenance control;
- the maintenance system controls total hours, landings and cycles for aircraft, engines and controlled components.

Resolução ANAC nº 773/2025 requires, for each flight as applicable, `totais de pousos e ciclos`. The eDB reference model under Portaria nº 3.220/SPO/SAR identifies `ciclos parciais e totais de voo (se aplicável)` and presents flight cycles separately from landings.

Accordingly, the MGM definition supplies the operator-authoritative semantic rule for the Costa do Sol **flight-cycle** field required by the eDB model. It does not define engine cycles or other special counters.

Full provenance and applicability decision:

- `docs/regulatory/edb/EDB_CYCLES_COSTA_DO_SOL_MGM_REV10_SOURCE_DECISION_20260910.md`

## Fail-closed boundary retained

This decision does not authorize any generic conversion:

- do not map `starts` to cycles;
- do not map the numeric landing count to cycles merely because both values often coincide in ordinary legs;
- do not use cargo-hook, hoist, crew-recency or engine counters as the eDB flight cycle;
- do not apply the Costa do Sol policy to another tenant/operator by inference.

The AirTrust regulatory source contract already permits an explicitly sourced `cycles` value and current tests prove that missing or ambiguous source data remains null. Runtime/source binding must continue to be explicit and operator-scoped.

## Issue #91 disposition

The two source-semantics questions tracked by #91 are now resolved:

- IFR real/simulated: resolved by MGO semantics;
- flight cycles: resolved by MGM Rev. 10 operator-maintenance definition.

Existing fail-closed runtime behavior remains correct and no migration, deploy or production write is required for this documentary source closure. Engine/component-cycle semantics remain separate maintenance concerns and are not being redefined as the eDB flight-cycle field.