# AirTrust FRMS PR-1 Hardening

Date: 2026-06-20

## Result

Status: `OK`

This macro stage hardened the backend-only FRMS PR-1 operational decision contract after PR #109. It did not deploy, did not apply migrations, did not run remote SQL, did not move the 0412 draft into real migrations, and did not touch SIGVOOS.

## Changes

- `eventId` validation now fails before DB access for arbitrary identifiers.
- Override accepts the system-supported `frms_read_ack_...` event IDs and UUID-style IDs.
- Override remains tenant-scoped through middleware-derived `empresa_id`.
- Override body still accepts only `justificativa` and optional `evidencia_ref`; body-provided `empresa_id` is ignored.
- `evidencia_ref` is limited to a technical pointer format and rejects obvious email, CPF, token, cookie, password, secret, bearer/JWT/API/session markers, and free-text sensitive patterns.
- `justificativa` remains 10-500 chars and rejects obvious PII/secret markers.
- Override audit payloads no longer store raw `snapshot_payload_json`, raw `ack_note`, or the free-text justification.
- `UPDATE` result is checked before inserting audit, covering a race between read and update.
- `PROJECAO` and `CHECKIN_SUBJETIVO` remain capped at `ALERTA`, even if a policy attempts to promote them to override or block.
- FDP/HV defaults are named and documented as technical fallback references, not company configuration or regulatory approval.
- Projection remains read-only with `meta.writes = 0`.

## Tests

Targeted tests cover:

- invalid event ID returning `422` without DB access;
- accepted `frms_read_ack_...` event ID;
- cross-tenant override returning `404` and ignoring `empresa_id` in the body;
- student/instructor forbidden;
- manager/admin allowed;
- sensitive `evidencia_ref` rejected;
- sensitive `justificativa` rejected;
- audit payload sanitization;
- projection read-only behavior;
- additive operational snapshot fields;
- `PROJECAO`/`CHECKIN_SUBJETIVO` capped at `ALERTA`.

Full validation executed for this macro stage:

- `npm run test:worker -- --run decision-policy operational-snapshot-extended override projection`: PASS, 4 files / 39 tests.
- `npm run test:worker -- --run operational-snapshot decision-policy override projection frms`: PASS, 38 files / 339 tests.
- `npm run test:run -- src/react-app/pages/escalas/__tests__/evdFrmsBadges.test.ts`: PASS, 1 file / 20 tests.
- `npx tsc --noEmit`: PASS.
- `npm run lint`: PASS.
- `npm run build`: PASS.

## Security

- Tenant isolation: `WHERE id = ? AND empresa_id = ?` remains mandatory for override reads and writes.
- RBAC: only manager/admin roles can apply override.
- PII: obvious sensitive data is rejected from override justification/evidence references, and audit payloads avoid raw snapshots.
- Auditability: `OVERRIDE_APPLIED` remains recorded with tenant, event, actor, timestamp, and sanitized before/after summaries.
- Read-ack and override remain conceptually separate, but storage is still temporarily coupled through `ack_note` until a future dedicated table is authorized.
- SIGVOOS remains `NO-GO`.

## Migration 0412

- Applied: no.
- Moved to `worker-airtrust/migrations`: no.
- Table `frms_decisao_override` created: no.
- Governance plan created: `docs/AIRTRUST_FRMS_MIGRATION_0412_GOVERNANCE_PLAN_20260620.md`.
- Draft remains: `docs/migration-0412-draft.sql`.

## Remaining Risks

- Dedicated override storage still requires future migration governance and explicit authorization.
- Backfill from temporary `ack_note` is not implemented in this stage.
- Multi-company operation remains `PILOTO CONTROLADO`.
- SIGVOOS remains `NO-GO`.
- PR-2 visual work for EVD, Escala Mensal, and Minha Escala was not started.
- Authenticated production smoke remains unavailable until authorized fixtures/session exist.

## Next Macro Stage

Recommended next macro stage: formal authorization review for migration 0412, or PR-2 EVD + monthly publication only after this hardening PR is reviewed/merged or after an explicit owner decision.
