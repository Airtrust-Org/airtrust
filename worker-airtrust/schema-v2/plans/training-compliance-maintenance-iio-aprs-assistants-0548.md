# Schema V2 0548 — IIO/APRS training for maintenance assistants

## Decision and verified baseline
On 2026-10-10, Training Management clarified that published maintenance-area courses apply to both mechanics and maintenance assistants. Read-only production D1 confirmed tenant 6 has one active model `MNT_IIO_APRS`, one active role `Auxiliar de Manutenção` with six active people, and exactly two existing active role requirements: Mecânico and Coordenador de Engenharia. The assistant rule is absent. No identity data is stored in this plan.

## Scope and constraints
Add exactly one function-scoped mandatory training requirement for Auxiliar de Manutenção. Copy the current mechanic rule's modality, evidence source, automatic enrollment setting and normative metadata. Do not modify the existing mechanic/coordinator rules, LMS records, completion, SCORM, qualifications, permissions or APRS signature privileges. Attendance or completion does not itself grant technical authorization.

## Preconditions and fail-closed behavior
Production baseline `production-d1-baseline-v2-20260714` must be active; candidate SHA, eight gates, Schema V2 manifest/hashes, recovery point and specific authorization required. SQL rejects baseline drift if the active model, role, six active assistants, two source requirements or distinct source functions are not exactly as observed. No remote migration is authorized by committing this file.

## Validation and postconditions
Dry-run SQL against a synthetic SQLite fixture must yield three active role requirements, one assistant requirement and unchanged original requirement data; absent, duplicate or drifted fixtures must fail without writes. Read-only production postcondition after governed Schema V2 application: exactly one assistant requirement, three total role requirements, with the assistant values matching the mechanic requirement except scope function and explanatory justification. Confirm six employees become subject to the requirement, without generating new LMS cycles or notifications in this migration.

## Recovery / publication
Capture official D1 Time Travel recovery point before apply. If governance rejects a state, stop; do not invent a fallback. Compensation must be separately reviewed and scoped to the inserted row. Schema and operational enrollment are separate steps; notifications remain paused pending independent reconciliation. Staging fixture QA and its postconditions precede production. Deploy Worker/Pages only if a separately reviewed code change requires them.
