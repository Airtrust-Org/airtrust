# training-operational-category-bootstrap-0541

## Objective and real incident
Restore the tenant-6 canonical qualification category `TREINAMENTO_OPERACIONAL` required by the *unchanged* reviewed 0536 FDM-three-audiences preflight. Production Schema V2 baseline `production-d1-baseline-v2-20260714` is active and change 0535 is applied, but production has **zero** current or historical categories with this code or operational-category name. Staging has exactly one active category with code `TREINAMENTO_OPERACIONAL`, name `Treinamentos Operacionais`, color `#6B7280`, domain null, `lms_integrada=0`. Production `PRAGMA table_info(qualificacoes_categorias)` confirmed that the live table lacks `lms_integrada`; the SQL deliberately uses only the columns common to production, and production validation must not access that staging-only column.

## Immutable scope and authority
- Tenant: Costa do Sol, `empresa_id=6`; canonical category identity only.
- Create exactly one non-PII catalog row **only if no category with the canonical code or canonical name exists**.
- Never alter existing rows, rename another category, synthesize historical qualification evidence, courses, certificates, enrollments, employee designations or compliance rules.
- This bootstrap is not a substitute for Schema V2 change `training-compliance-fdm-three-audiences-0536`; 0536 remains the authoritative FDM audience change.

## Preconditions
1. Production baseline active and prerequisite 0535 applied; 0536 and 0541 not applied.
2. Tenant 6 exists.
3. Production currently has zero code/name identities for the category; fail closed if any appear (an independently repaired catalog must be reviewed rather than overwritten).
4. On staging, 0536 and its category have already been applied, so 0541 is deliberately an atomic no-op with ledger/postcondition validation.
5. Exact reviewed manifest/SQL/plan hashes, recovery and rollback readiness, official CI and protected workflow.

## Application sequence
- **Staging (if authorized separately):** validate through the official allowlisted staging D1 workflow; the catalog category already exists there and SQL is an atomic no-op. This production-direct request does not authorize or require staging execution.
- **Production:** apply this 0541 through `apply-schema-change-v2.yml` with *separate exact release SHA and change_id authorization* and verified recovery. Then apply 0536, 0540, 0539, 0537 and 0538 serially, each with its governed preconditions and authorization.
- Do not infer that a versioned file was applied merely because it is merged.

## Postconditions and compensation
- Exactly one active tenant-6 `TREINAMENTO_OPERACIONAL` category named `Treinamentos Operacionais` (canonical code, color, active status and null domain) with no duplicates; production does not have an `lms_integrada` column.
- Ledger for this change exactly once in each environment.
- Preserve pre-existing cross-tenant and qualification history data.
- Forward-only compensation by a separately reviewed Schema V2 change; emergency recovery through governed D1 Time Travel, never ad-hoc SQL.
