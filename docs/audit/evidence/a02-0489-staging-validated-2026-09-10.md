# A-02 / 0489 — Staging validated — 2026-09-10

## Scope

This evidence records the governed staging validation of `a02-natural-keys-tenant-scoped-0489` before any production write.

## Structural staging apply

- Governed staging schema-change run: `34485516078`.
- Migration: `0489_a02_natural_keys_tenant_scoped.sql`.
- Dedicated 0489 preflight: PASS.
- D1 recovery point captured before apply.
- Migration applied exactly once in staging and ledger verified.
- Dedicated 0489 postconditions: PASS.
- Production touched: no.

## Reviewed staging runtime

- Official staging Worker deploy run: `34489086943`.
- Reviewed runtime source SHA served by staging: `2618a9998a44438216f9ad02d688b5eaa43ec351`.
- Worker Version ID: `3f23399d-cf20-4bdc-a1ae-322725b44bd7`.
- Provenance and authenticated smoke: PASS.
- Migrations during this deploy: none.
- Production touched: no.

## Functional lifecycle validation

The first functional run `34490438013` proved the natural-key lifecycle but exposed a QA cleanup incompatibility with the legacy `auditoria` table. The functional semantics and 0489 postconditions passed; the run was not accepted as final because cleanup failed closed.

The QA cleanup harness was corrected by PR #622 to use the schema-safe V2 cleanup. Residual synthetic fixtures from the first run were then removed by governed orphan-cleanup run `34492291184`, with final `cleanup=PASS`.

Final functional validation run: `34492881316`.

Runtime guard:

- runtime SHA is in current `main` history: PASS;
- official release gates for runtime SHA: PASS;
- staging `/api/version` exact source SHA match: PASS.

Required functional operations: `10/10 PASS`.

- same CPF/matricula/email accepted across distinct tenants;
- duplicate active CPF rejected inside one tenant;
- duplicate active matricula rejected after `TRIM` canonicalization;
- duplicate active email rejected after `LOWER(TRIM(...))` canonicalization;
- soft-delete removes the row from uniqueness participation;
- keys are reusable after soft-delete;
- original row can be reactivated after replacement is soft-deleted;
- duplicate remains rejected after reactivation.

Final disposable fixture run:

- run id: `573c1b28`;
- tenant ids: `999062`, `999063`;
- cleanup V2: PASS;
- cleanup postconditions: `empresas=0 usuarios=0 refreshTokens=0 funcionarios=0 setores=0 domainEvents=0`.

0489 postconditions were revalidated after cleanup and passed, including:

- `ux_funcionarios_cpf_empresa_active`;
- `ux_funcionarios_matricula_empresa_active`;
- `ux_funcionarios_email_empresa_active`;
- exact CPF/matricula/email index contracts;
- `idx_qualificacoes_tipos_codigo_empresa_active`;
- no duplicate active CPF/matricula/email under the reviewed canonical semantics.

Sanitized evidence artifact:

- artifact name: `a02-0489-staging-functional-evidence`;
- artifact id: `10158594267`;
- SHA-256: `14a7d8da2827dd2f611e5905f11f5c697e32c0b7f5447d5a932ead0cd361a0e4`.

## Current closure state

Staging is fully validated. No internal code remediation remains for A-02.

Production remains intentionally unapplied until a separate explicit authorization triggers the reviewed Schema V2 production workflow with the exact then-current `main` SHA. The production workflow must still pass its dedicated 0489 preflight, capture a D1 Time Travel recovery point, apply schema + ledger atomically, verify the exact ledger row and pass production postconditions.
