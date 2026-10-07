# training-compliance-integra-bootstrap-0535

## Cause
The governed staging application of 0534 succeeded at the D1 transport and ledger level. Read-only rerun 37570198911 then proved one and only one failing 0534 postcondition: **INTEGRA is completely absent** in tenant 6 staging. All other 0534 postconditions passed. Counts for active, any-state, exact-code, EAD-category, 24-month, 2-hour, name candidates and active linked courses were all zero.

0534 normalized an existing INTEGRA model and rebuilt its company-wide requirement, but did not create the qualification identity when it was absent. This forward repair closes that prerequisite gap; the applied 0534 SQL is immutable.

## Change
- Tenant: Costa do Sol, empresa_id=6 only.
- Reuse and normalize an existing INTEGRA identity if a target environment already has one.
- Otherwise create exactly one canonical `INTEGRA` / `Integração Corporativa` model.
- Bind it to the active tenant EAD category required by migration 0457.
- Apply the final matrix metadata: EAD, 24 months, 2 hours initial/recurring.
- Preserve the descriptive/reference metadata reviewed in 0533.
- Create the missing company-wide mandatory requirement from 0534 only if absent.

## Safety
No LMS course or SCORM package is fabricated. No enrollment, certificate, qualification history, employee, designation, R2 object or other tenant is written. Existing INTEGRA identity/course/history is preserved where present. Production remains unavailable without exact-SHA and exact-scope authorization.

## Validation
Preflight requires 0534 ledger/provenance, a unique active EAD category and at most one current INTEGRA identity. Postconditions require exactly one canonical model, canonical category FK, exact final-matrix metadata, exactly one active company-wide mandatory rule, and no active non-company INTEGRA requirement. After staging 0535, the full strict 0534 postcondition validator must pass.

## Compensation
Forward-only Schema V2 compensation if policy changes. D1 Time Travel is a recovery contingency, not a substitute for preserving newer unrelated data.
