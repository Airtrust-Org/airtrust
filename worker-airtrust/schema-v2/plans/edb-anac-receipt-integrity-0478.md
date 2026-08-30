# Schema V2 Plan — eDB ANAC receipt integrity 0478

## Purpose

Harden the disabled eDB ANAC outbox/receipt persistence foundation without implementing or guessing any ANAC external protocol.

## Preconditions

- Schema V2 baseline `production-d1-baseline-v2-20260714`.
- Change `0477_edb_operational_core.sql` must exist before this change is applied.
- No production activation of eDB is implied by this plan.

## Change

- make outbox identity/payload fields immutable after enqueue while leaving delivery-state fields mutable;
- prohibit deletion of outbox history;
- require receipt → outbox tenant binding;
- validate basic receipt identity, timestamp and HTTP-status shape;
- make receipts append-only.

## Postconditions

- direct SQL cannot rebind an outbox item to another revision or tenant;
- a receipt cannot be attached to an absent/cross-tenant outbox;
- persisted receipt evidence cannot be updated or deleted.

## Rollback / recovery

This is an additive trigger-only change. Before any governed apply, create the normal recovery point. If rollback is required before production activation, restore from that recovery point rather than issuing destructive ad-hoc SQL.

## Activation posture

Defined only. Do not apply to staging or production as part of PR #110.
