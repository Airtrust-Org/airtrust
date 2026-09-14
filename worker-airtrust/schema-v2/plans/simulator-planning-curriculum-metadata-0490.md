# Schema V2 plan — Simulator Planning Curriculum Metadata (0490)

## Objective

Restore the deterministic simulator-planning metadata lost during the M2026.07 model-versioning/import chain, without changing historical session records or inventing curriculum membership.

The approved 2026 planning curriculum for Costa do Sol is derived from the versioned session contract and the current operational C2 cycle:

- `G1` / AW139 periodic: `A139-P-01/04-C2`, `A139-P-02/04-C2-OFFSHORE`, `A139-P-03/04-C2-IFR-LOFT`, `A139-P-04/04-C2-CHECK` in local order 1..4;
- `G1-SEM` / AW139 semiannual: `A139-S-01/02-C2`, `A139-S-02/02-C2` in local order 1..2;
- `G2` / S-76 periodic: `S76-P-01/03-C2`, `S76-P-02/03-C2`, `SK76-P-CHECK` in local order 1..3. The pre-0459 `/04` aliases are accepted only as one complete unmixed state.

All 25 current recurrent AW139/S-76 session models covered by the source curriculum retain/restore the approved duration of 120 minutes. C1/C3 generation/check links are preserved but remain unordered, so they do not enter the active planning curriculum.

## Root cause

The versioned matrix import created new physical current rows without carrying forward `duracao_estimada` and `ordem_no_treinamento`. Later reconciliation restored `gera_qualificacao` / `qualificacao_tipo_id` on check rows, but `qualificacao_tipo_id` has two meanings: qualification generation and curriculum association. Treating every linked row as curriculum therefore over-selects C1/C3 generating checks.

0490 makes the contract explicit: a session is a schedulable curriculum member only when `ordem_no_treinamento IS NOT NULL`.

## Safety preconditions

Before remote apply, the read-only preflight must prove:

1. the Schema V2 baseline is active and 0490 is unapplied;
2. tenant 6 resolves exactly one active `G1`, `G1-SEM` and `G2`;
3. exactly 18 current AW139 recurrent rows exist under the reviewed canonical codes;
4. S-76 is entirely in either the pre-0459 `/04` state or the post-0459 `/03` state, never mixed;
5. `SK76-P-CHECK` resolves uniquely;
6. every existing recurrent duration is either NULL or 120; a conflicting duration aborts;
7. C2 target links/orders are either empty or already compatible with the reviewed qualification/order;
8. no other G1/G1-SEM/G2 current row is already ordered outside the approved C2 curriculum.

Any violation is NO-GO. The change does not clean up arbitrary drift.

## Data changes

The reviewed SQL:

- updates only current physical session rows selected through `modelos_sessao_versionamento`;
- sets recurrent `duracao_estimada` to 120 minutes for the reviewed 25 current models;
- sets the nine C2 curriculum memberships/orders;
- preserves generation-only qualification links on unordered C1/C3 checks;
- replaces the 0482 dependency-enrichment trigger so dependency snapshots contain only ordered curriculum members;
- repairs only still-open dependency-generated planning snapshots; finalized/cancelled history is untouched.

No qualification history, completed ficha, simulator booking, employee record or cross-tenant data is rewritten.

## Runtime alignment

The same release updates Planning V2 and the flight-curriculum routes so `ordem_no_treinamento` is the explicit membership signal. Proposal generation no longer accepts CAE availability. CAE scheduling is a second-stage `/comparar-cae` operation against the already formed proposal and therefore cannot silently regenerate its crew pairing.

## Staging

Staging apply is allowed only through the reviewed staging schema-change workflow after exact-SHA review, read-only 0490 preflight, D1 Time Travel recovery-point capture and dedicated postconditions. No local/manual remote D1 write is authorized by this plan.

## Production

Production apply is allowed only through `Apply Schema Change V2` on `main`, with the exact reviewed SHA/change ID, production Environment approval, active baseline verification, dedicated 0490 preflight, D1 Time Travel recovery point, atomic SQL+Schema-V2-ledger bundle and dedicated postconditions.

Merging this plan does not authorize production apply or deployment.

## Postconditions

After apply:

- exactly 25 reviewed current recurrent models have duration 120;
- exactly 9 current G1/G1-SEM/G2 models are ordered;
- their canonical code, qualification and local order match the reviewed C2 matrix;
- no open dependency snapshot references an unordered model;
- the dependency-enrichment trigger exists with ordered-curriculum semantics;
- the exact Schema V2 ledger row exists.

## Recovery

For a failed remote apply, use the D1 Time Travel recovery point captured immediately before execution. Do not run ad-hoc UPDATE/DELETE rollback SQL in production.

A future intentional switch from C2 to another rolling cycle is a new reviewed curriculum decision and a new Schema V2 change; 0490 must not be edited or replayed.
