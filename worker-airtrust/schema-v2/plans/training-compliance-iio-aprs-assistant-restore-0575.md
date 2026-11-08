# Schema V2 0575 — controlled repair of mandatory IIO/APRS training applicability

## Baseline and authorization
Read-only production D1 on 2026-11-08: tenant=6, model=127 (`MNT_IIO_APRS`), mechanic requirement=198 active; coordinator=199 deleted 2026-10-10 22:39:04; assistant=704 deleted 2026-10-10 22:39:09 after Schema V2 0548 was successfully applied. Six active assistants were previously verified, to be rechecked by preflight. See issues #1377, #1382, #2081.

Restore **only** existing assistant requirement id704. Do not restore coordinator id199 without revalidating policy. Do not add APRS technical/approval privileges, alter LMS enrollment, certificates, qualifications, notification settings, mechanic rule or other tenants. Preserve original rule metadata, including `auto_matricular_ead=0`.

## Mandatory controls
Before applying, establish authoritative root cause/approval for reversing the earlier deletion; if the deletion was intentional, stop and withdraw candidate. Production D1 write requires a separately reviewed exact SHA, eight green gates, the official `Apply Schema Change V2` workflow with D1 Time Travel recovery point, manifest hashes and authenticated postconditions. Run staging isolated synthetic six-person fixture first. Dry-run and preflight must prove every immutable ID and precondition, without logging PII. Do not apply merely because PR was merged.

## Afterward
Check ledger 0575, exactly one active mechanic and one active assistant rule, zero duplicate assistant requirements, exactly six active assistants affected, audit record present and coordinator still inactive. Verify tenant isolation, Compliance effective applicability read-only, and no LMS enrollment or notifications were created by the migration. Any contradictory state halts and requires governed recovery. Do not use ad hoc SQL production write.

## Recovery
Use the official D1 Time Travel bookmark captured at apply. If compensation is preferable, separately approve a narrowly scoped reversal of id704 and the audit event; never broad-delete requirements or evidence.
