# Production Schema V2 plan — Certificate validation hash index 0470

## Objective

Replace the public certificate-validation O(N) scan with an indexed persisted token while preserving every already-issued 16-hex QR/hash contract.

## Preconditions

- exact release SHA is current GitHub `main` and explicitly authorized for the target environment;
- all eight official release gates are green for the exact SHA;
- staging has validated generation, historical backfill and indexed lookup before production;
- production D1 schema contract is green;
- baseline `production-d1-baseline-v2-20260714` is ACTIVE;
- change `certificate-validation-hash-0470` is absent from `airtrust_schema_changes_v2`;
- fresh governed recovery point/backup evidence exists.

## Reviewed schema operation

Add nullable `qualificacoes_historico.validacao_hash` constrained to the existing 16-uppercase-hex token format and create a partial lookup index on active rows. The schema apply performs no data backfill and changes no certificate/QR token.

## Historical backfill

Backfill is a separate governed data operation. It must recompute the exact legacy token from CPF digits + qualification code + `data_conclusao` date + certificate number using the shared application helper, scope every update by historical row/tenant, be idempotent, report duplicates/invalid source rows, support dry-run, and verify that every eligible issued certificate has a populated hash before the O(N) compatibility scan is removed.

## Postconditions

- `validacao_hash` exists and is nullable;
- malformed non-null values are rejected by the column CHECK;
- `idx_qualificacoes_historico_validacao_hash` exists and targets the new column;
- backfill verification (when separately authorized) reports zero eligible missing hashes and no ambiguous hash collisions;
- indexed public lookup returns the same certificates as the legacy hash contract;
- exact Schema V2 ledger row matches reviewed hashes/baseline/SHA;
- schema contract remains green.

## Rollback

Capture D1 Time Travel immediately before apply. The additive column/index may remain inert if runtime rollback is required. Restore the recovery point only for partial/corrupt schema apply. Dropping the column/index or reversing backfilled data is a separate governed database action.
