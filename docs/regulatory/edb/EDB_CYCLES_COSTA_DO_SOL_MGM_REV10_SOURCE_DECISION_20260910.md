# eDB cycles — Costa do Sol MGM Rev. 10 source decision — 2026-09-10

Issue: #91  
Scope: operator-semantic source / governance  
Runtime change: none  
Production write: none

## Decision

For Costa do Sol ordinary flight records, the controlled maintenance source now reviewed supplies the previously missing operator-authoritative meaning of a **flight cycle**:

> Etapa de voo é um ciclo de voo composto de uma decolagem e um pouso em sequência.

Source: Costa do Sol `MNL-MNT-001` — Manual Geral de Manutenção (MGM), Revision 10, dated 2025-10-24, Appendix 2, item A2.12 (Item Recorrente ou Intermitente), note 1.

This closes the semantic-source gap for the ANAC eDB field **flight cycles** for this operator. It does **not** define or equate engine-cycle, cargo-hook-cycle, hoist-cycle, engine-start, or other special-purpose counters.

## Corroborating operator-maintenance context

The same MGM establishes a consistent maintenance context for this definition:

1. Section 3.5.2.1 states that the Diário de Bordo is the principal document for recording and tracking aircraft flight hours and cycles, with information updated within 24 hours after the flight.
2. Section 4.2 states that every Costa do Sol flight is recorded in the Diário de Bordo with hours, landings and cycles flown.
3. Section 6.4 states that CTM updates the computerized control with flight hours, cycles and landings received from the Diário de Bordo and that the system controls total hours, landings and cycles of aircraft, engines and controlled components.
4. Appendix 2 A2.12 supplies the explicit event definition for **ciclo de voo**: one takeoff followed by one landing in sequence.

These passages are read together. The A2.12 note is not being generalized into a definition of every maintenance counter; it is used only to establish the operator's meaning of the **flight-cycle event** recorded for aircraft operation.

## ANAC field alignment

Resolução ANAC nº 773/2025, effective 2026-01-01, requires the Diário de Bordo to record for each flight, as applicable, both `totais de pousos e ciclos` and the takeoff/landing timestamps.

The current compiled reference model established by Portaria nº 3.220/SPO/SAR/2019 identifies `ciclos parciais e totais de voo (se aplicável)` and presents `Ciclos parciais/totais` separately from `Pousos parciais/totais`.

Therefore the MGM definition is aligned to the semantic object required by the eDB model: **flight cycles**, not engine starts and not a generic equality between the numeric landing count and the cycle count.

## AirTrust mapping boundary

This decision does **not** authorize a global rule such as:

- `cycles = starts`;
- `cycles = landingsTotal`;
- `cycles = 1` merely because an operational row exists;
- applying the Costa do Sol rule to another tenant/operator.

The existing AirTrust domain boundary is deliberately correct:

- `EdbExplicitRegulatoryStageData.cycles` / `ControleVoosEtapaRegulatoriaRow.ciclos` can carry a cycle value from an explicitly established regulatory/operator source;
- legacy RDV/SIGVOOS `starts` remains separate;
- the legacy shadow projection leaves `cycles = null` and reports `CYCLES_NOT_MAPPED_FROM_STARTS` when only ambiguous operational data exists;
- the control-flight draft projection likewise leaves cycles null while its semantics are unconfirmed.

A source adapter may populate `cycles` for Costa do Sol only when its input is explicitly bound to this controlled operator policy or to a structured Costa do Sol source that already records the cycle value. The policy itself must not be inferred from a tenant id, company name, CNPJ, or generic helicopter type inside the domain projection.

## Existing regression proof

Current tests already satisfy the #91 fail-closed closure requirements:

1. `worker-airtrust/src/__tests__/edb/regulatory-projection.test.ts`
   - an explicitly supplied regulatory `cycles: 1` populates `record.flight.cycles`;
   - an override for another stage does not populate the value;
   - an explicit null value leaves the cycle gap unresolved.
2. `worker-airtrust/src/__tests__/edb/rdv-shadow-projection.test.ts`
   - a stage with `starts: 2` and one landing still produces `flight.cycles = null`;
   - `CYCLES_NOT_MAPPED_FROM_STARTS` remains present.
3. `worker-airtrust/src/__tests__/services/edb-control-flight-draft-projection.test.ts`
   - operational control-flight data retains `CYCLES_SEMANTICS_UNCONFIRMED` rather than silently promoting legacy counters.

No runtime change is required merely to close the **missing authoritative semantic source** finding. Runtime/source-binding work belongs to the eDB product implementation and must preserve this explicit-source boundary.

## Superseded portion of the 2026-09-07 review

`EDB_COSTA_DO_SOL_MGO_SOURCE_MAPPING_2026-09-07.md` correctly concluded, based on the source set available on 2026-09-07, that no operator maintenance source then reviewed defined the ordinary flight-cycle event.

That source-set conclusion is superseded only for the flight-cycle semantic question by the later review of `MNL-MNT-001` MGM Rev. 10 on 2026-09-10. Its warnings remain valid for engine cycles, cargo-hook cycles, starts, landing-count substitution, and cross-tenant generalization.

## Closure disposition

Issue #91 may be closed as **SOURCE RESOLVED / FAIL-CLOSED RUNTIME PRESERVED** because:

- the operator-authoritative flight-cycle counting event is documented with provenance;
- the ANAC eDB semantic target is confirmed as flight cycles;
- AirTrust already represents an explicit regulatory cycles value;
- tests prove explicit data can populate cycles;
- tests prove ambiguous/missing data remains null;
- starts and landing counts are not silently promoted.

This decision does not claim that engine or component cycle counters are identical to the eDB flight-cycle field.