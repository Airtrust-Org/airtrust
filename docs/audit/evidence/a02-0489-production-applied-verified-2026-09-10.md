# A-02 / 0489 — Production applied and verified — 2026-09-10

## Scope

This evidence records the explicitly authorized, governed production application and verification of `a02-natural-keys-tenant-scoped-0489` after the full staging proof had completed successfully.

## Authorization and immutable source

- Explicit production authorization was received before dispatch.
- Governed workflow: `Apply Schema Change V2`.
- Production run: `34498650094`.
- Exact reviewed `main` SHA: `08be24e034968d19049d84e127d5f4e10c59fdec`.
- Change ID: `a02-natural-keys-tenant-scoped-0489`.
- Baseline ID: `production-d1-baseline-v2-20260714`.
- Migration file hash: `046d9ee05c31c7f637bee2521aebd293227ceba64c3ae88c5e29414dce5264e4`.
- Plan hash: `966a9719773661a575c05a362ebbeef9238ed4fc153605b3a1ee5ab0cc727787`.

The immutable dispatch guard passed and the workflow checked out the exact reviewed `main` SHA.

## Production preflight

The current production schema contract passed before the apply. The Schema V2 ledger confirmed exactly one active baseline and confirmed that the A-02/0489 change was not yet applied.

Dedicated 0489 production preflight result:

`A02_NATURAL_KEYS_0489_PRODUCTION_PREFLIGHT=PASS`

The preflight verified, among other required conditions:

- active Schema V2 baseline;
- change still unapplied;
- required `funcionarios` and `qualificacoes_tipos` tables/columns;
- current tenant index contract for `qualificacoes_tipos.codigo`;
- no active duplicate CPF under canonical digits-only semantics;
- no active duplicate matricula under `TRIM` semantics;
- no active duplicate email under `LOWER(TRIM(...))` semantics;
- no active noncanonical CPF or matricula whitespace drift that would invalidate the apply;
- expected legacy index contracts;
- no unexpected global natural-key unique indexes;
- no replacement-index drift.

## Recovery point

Before the schema write, the workflow:

- backed up the Schema V2 governance ledger;
- captured a D1 Time Travel recovery point for `airtrust-db`;
- recovery timestamp: `2026-09-10T15:56:41Z`.

## Atomic production apply

Production D1 target:

- database name: `airtrust-db`;
- database id: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`.

The reviewed combined SQL bundle was applied remotely and atomically:

- 8 queries processed;
- execution success: true;
- rows read: 1061;
- rows written: 387;
- final D1 bookmark: `00008852-0000000e-000050e2-5fef856f87a2e722f0b46362fe8843a9`.

The workflow then verified exactly one Schema V2 ledger row matching all reviewed provenance fields:

- change ID;
- baseline ID;
- migration file hash;
- plan hash;
- GitHub SHA.

Ledger postcondition: PASS.

## Production postconditions

The full production schema contract passed again after the write.

Dedicated A-02/0489 postcondition result:

`A02_NATURAL_KEYS_0489_PRODUCTION_POSTCONDITIONS=PASS`

Verified postconditions include:

- `ux_funcionarios_cpf_empresa_active` exists and is unique;
- `ux_funcionarios_matricula_empresa_active` exists and is unique;
- `ux_funcionarios_email_empresa_active` exists and is unique;
- exact CPF index contract;
- exact matricula index contract;
- exact email index contract;
- tenant index for `qualificacoes_tipos.codigo` remains valid;
- legacy/global natural-key unique-index state is as reviewed;
- no ambiguous legacy indexes;
- no duplicate active CPF under reviewed canonical semantics;
- no duplicate active matricula under reviewed canonical semantics;
- no duplicate active email under reviewed canonical semantics.

## Closure

A-02 / migration 0489 is **CLOSED / PRODUCTION_CONFIRMED**.

The reconciled audit scope now has:

```text
OPEN_INTERNAL=0
GOVERNED_MIGRATION_PENDING=0
ADMIN_BLOCKED=2
EXTERNAL_BLOCKED=2
ACCEPTED_DEBT=4
```

The remaining administrative blockers, external dependencies and accepted debt are separately classified and are not open internal engineering findings.