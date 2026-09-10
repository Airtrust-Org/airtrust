# Schema V2 plan — A-02 Tenant-Scoped Natural Keys (0489)

## Objective

Restore database-level uniqueness for active employee natural keys without reintroducing global cross-tenant constraints.

The reviewed contract is:

- CPF: canonical runtime writers persist digits-only values; uniqueness is per `(empresa_id, cpf)`.
- Matrícula: surrounding whitespace is not identity; case remains significant; uniqueness is per `(empresa_id, TRIM(matricula))`.
- E-mail: the canonical user↔employee linkage uses `LOWER(TRIM(email))`; uniqueness uses the same expression inside each tenant.
- Soft-deleted rows and null/blank values do not participate in the partial unique indexes.
- Reuse of the same natural key by different tenants remains valid.

## Safety preconditions

Before any remote apply, the target database must pass a read-only fail-closed preflight:

1. no active intra-tenant CPF duplicates;
2. no active intra-tenant matrícula duplicates after `TRIM`;
3. no active intra-tenant e-mail duplicates after `LOWER(TRIM(...))`;
4. no active CPF containing non-digit characters;
5. no active matrícula with surrounding whitespace drift;
6. ambiguous historical index names `idx_funcionarios_cpf` and `idx_funcionarios_matricula` must be absent;
7. the reviewed 0489 change must not already exist in the Schema V2 ledger.

Any violation is NO-GO. This plan does not authorize data cleanup or mutation to make a preflight pass.

## Apply ordering

The migration creates all three replacement tenant-scoped unique indexes first. Only after those CREATE statements succeed does it drop known global legacy UNIQUE index names.

This ordering is deliberate: if the apply executor does not wrap the whole file in one transaction, a failure while creating replacements cannot first remove the existing global protection.

The ambiguous historical names `idx_funcionarios_cpf` and `idx_funcionarios_matricula` are never dropped automatically.

## Staging

Staging apply is allowed only through the existing governed staging schema-change workflow after:

- exact reviewed SHA checks;
- recovery point capture;
- the dedicated 0489 read-only preflight;
- one-file apply;
- dedicated 0489 postconditions.

## Production

Production apply is allowed only through `Apply Schema Change V2` with:

- branch `main`;
- exact `expected_sha`;
- exact change ID `a02-natural-keys-tenant-scoped-0489`;
- confirmation `AIRTRUST_PRODUCTION`;
- production Environment gate;
- Schema V2 active baseline verification;
- dedicated 0489 production preflight;
- D1 Time Travel recovery point;
- atomic reviewed SQL + Schema V2 ledger bundle;
- dedicated 0489 production postconditions.

No legacy migration-chain replay is authorized for production.

## Postconditions

After apply:

- `ux_funcionarios_cpf_empresa_active` exists and is UNIQUE;
- `ux_funcionarios_matricula_empresa_active` exists and is UNIQUE;
- `ux_funcionarios_email_empresa_active` exists and is UNIQUE;
- each index retains its reviewed expression/partial-filter semantics;
- known global legacy UNIQUE indexes are absent;
- ambiguous historical index names remain absent;
- the exact Schema V2 ledger entry exists in production.

## Rollback / recovery

The preferred recovery mechanism for an apply failure is the D1 Time Travel recovery point captured immediately before the governed write.

Do not perform an ad-hoc DROP/CREATE rollback in production.

A future intentional rollback of the tenant-scoped identity model requires a separately reviewed change because restoring global uniqueness could reject legitimate same-key records across tenants.

No staging or production apply is authorized merely by merging this plan.
