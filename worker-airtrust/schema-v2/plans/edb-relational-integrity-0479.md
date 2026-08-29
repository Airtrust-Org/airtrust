# Schema V2 Plan — eDB diary/discrepancy/audit integrity 0479

## Purpose

Close remaining persistence-scope gaps in the disabled eDB foundation before any internal API or staging activation.

## Preconditions

- Schema V2 baseline `production-d1-baseline-v2-20260714`.
- `0477_edb_operational_core.sql` and `0478_edb_anac_receipt_integrity.sql` precede this change.
- No production/staging eDB data is expected because the feature remains disabled.

## Change

- materialize `voo_id`, `situacao_tecnica_id` and the canonical `actor_json` snapshot on `edb_auditoria_eventos`;
- require volume → diary tenant scope;
- prevent rebinding volume opening identity;
- require discrepancy → immutable revision tenant scope;
- require maintenance action → discrepancy tenant scope;
- require RTS approval to reference a prior corrective action on the same discrepancy;
- require audit events to bind to the correct diary/revision/flight/technical situation and previous diary-chain hash;
- preserve the actor snapshot required to rehydrate and recompute historical audit-event hashes;
- require integrity incidents to bind to the correct diary/volume and prevent identity rebinding.

## Postconditions

- persisted domain IDs match the SQL schema types and scopes;
- preflight audit events can be queried by flight/technical situation without parsing opaque JSON;
- an audit event can be rehydrated with the same actor identity that participated in its canonical hash;
- direct SQL cannot attach discrepancy, maintenance, audit or integrity history to another tenant/object;
- audit-chain insertion fails closed when the previous hash does not match the latest diary event.

## Rollback / recovery

This is additive schema hardening. Before any future governed apply, create the normal recovery point. If rollback is required before activation, restore that recovery point rather than issuing destructive ad-hoc SQL.

## Activation posture

Defined only. Do not apply to staging or production as part of PR #110.
