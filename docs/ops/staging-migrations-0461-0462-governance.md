# Governed staging migrations 0461 and 0462

Both migrations use `apply-approved-migration-with-recovery-point.sh`: schema SQL and the single `d1_migrations` row are submitted together, only after the specialized read-only preflight and a D1 Time Travel recovery point.

| Migration | Pending contract | Postcondition | Recovery classification |
| --- | --- | --- | --- |
| 0461 | `refresh_tokens` has legacy `id`, `user_id`, `revoked_at`; no `empresa_id` nor target index | nullable `empresa_id INTEGER` and `idx_refresh_tokens_empresa` | **FORWARD_ONLY**. The migration revokes legacy sessions; recovery is verified backup/Time Travel restore or forward repair, never a destructive automatic rollback. |
| 0462 | canonical legacy global `idx_qualificacoes_tipos_codigo`, **or** the exact schema-only staging baseline fingerprint (`20260701` baseline plus the 0412/0454 additive fields and six documented non-unique indexes), no tenant-active index, and zero active tenant/code duplicates | only tenant-active NOCASE partial unique index; no residual global index | **RESTORE_REQUIRED**. Recreating global uniqueness can reject legitimate A/CMA + B/CMA data created after 0462. |

The baseline alternative is an exact structural recognizer, not a missing-index fallback: an extra/missing column or index, changed index SQL, residual global uniqueness, or a 0462 ledger row is refused. The baseline was intentionally schema-only and excluded `d1_migrations`; this does not waive the required 0461 ledger confirmation before 0462 is submitted.

0462 is refused unless 0461 is ledger-confirmed and structurally `ALREADY_APPLIED`. Any schema/ledger divergence, partial state, unreadable metadata, or duplicate active tenant/code data is fail-closed and must be reconciled separately.
