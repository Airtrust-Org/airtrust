# Schema V2 0564 — Historical supplier identity

**REVIEW ONLY. DO NOT APPLY.** New Worker runtime needs this column. Schema V2 0563 must be applied first in each environment, followed by a separate authorized governed apply of 0564 before any deployment of that Worker.

## Root cause and contract
The current physical row records supplier display name and client_local_id, but not the original catalog code. Renaming the catalog made an accepted event appear changed; deactivation made a previously accepted event fail the active-only validation. Freeze the supplier code in supplier_code_at_acceptance when a NEW offline event is accepted. Keep fornecedor as the historically displayed original name. The insert guard requires the supplier code for new client-ID events and an immutable trigger protects it. Existing physical fuelings and manual records keep NULL. There is NO guessed backfill.

## Runtime compatibility
For an already recorded (empresa_id, voo_id, client_local_id), a matching immutable supplier code and all original fields is an accepted cumulative event, not a new fueling. Skip reinsert. Different code or changed values fails HTTP 409 before D1.batch. For old rows whose code is NULL, only an unambiguous original supplier name and currently matching code may replay; changed names or identity ambiguities require Coordination review (HTTP 409) rather than a false match. Exact accepted-command receipt replay remains independent. New events require an active same-tenant supplier. Different client IDs with identical liters, time, invoice and supplier are still independent physical fuelings.

For justifications, only the unchanged existing accepted tenant/flight link can outlive catalog deactivation; new or changed inactive justifications fail closed. Preserve receipts, version CAS, unique client-ID index, stage guards, D1.batch atomicity and audit.

## Preflight and official application
Verify live main and release SHA, eight required checks, 0563 ledger and physical column/index, 0564 ledger absent and column/triggers absent, reviewed manifest/plan SHA256, target binding, D1 Time Travel recovery point, exclusive schema write window and approved workflow allowlist. Use Schema V2 official workflow ONLY after explicit authorization. No remote D1/R2 writes, production flag changes or deploy are authorized by this PR.

## Postconditions and recovery
Confirm one new nullable supplier code column; two enforcement triggers; preserved 0563 unique index and client ID immutability; unchanged historical rows/counts; one ledger entry with exact hashes; tenant/FK consistency. If apply fails, hold Worker release. No dropping identity guards or rewriting legacy rows without separately authorized compensation and recovery. Real iPad/Android and XML acceptance remains a separate per-release gate.
