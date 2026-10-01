# organizational-structure-pj-normalization-0525

## Objective
Convert the 13 reviewed Costa do Sol employee records that still lack a canonical function into normal organizational records, create the missing function catalog entries and sector-function pairs, and remove provisional `TEMP-TRN-*` matricula placeholders without inventing identity data.

## Source and scope
- Source: reviewed training pre-load workbook dated 2026-09-28.
- Tenant: Costa do Sol (`empresa_id=6`) only.
- The source workbook and employee names are deliberately not copied into the repository; the reviewed production employee IDs are the bounded selectors.
- Existing canonical sectors are reused where the spreadsheet label is an organizational synonym: `Financeiro` → `Controladoria`; `RH` → `Recursos Humanos`.
- Missing canonical sectors are created only for `Diretoria` and `TI`.

## Change
1. Create `Diretoria` and `TI` sectors if absent.
2. Add tenant-local sector aliases for `Financeiro` and `RH`.
3. Create 13 missing canonical function entries required by the reviewed records.
4. Add aliases for the two conflicting historical labels that resolve to a single reviewed function.
5. Create the 13 required canonical sector-function pairs.
6. Normalize the 13 bounded active employee records to canonical `setor_id`, `setor`, `funcao_id`, `funcao` and `cargo`.
7. Replace only provisional `TEMP-TRN-*` matricula placeholders with `NULL`; no real registration number is invented or overwritten.

## Safety
- No employee is created, deleted, deactivated or moved across tenants.
- No CPF, email, phone, address, ANAC code, qualification history, training enrollment, RBAC assignment or certificate is changed.
- No employee name is versioned in SQL, tests or documentation.
- Existing non-temporary matricula values are preserved.
- The change is idempotent and tenant-scoped.
- Canonical sector/function tenant triggers from Schema V2 change 0492 remain authoritative.

## Preflight
Before production apply:
1. Confirm exact `main` SHA and active baseline `production-d1-baseline-v2-20260714`.
2. Confirm Schema V2 change `organizational-structure-normalization-0492` exists in the production ledger.
3. Confirm all 13 bounded employee IDs exist exactly once in tenant 6, are active and not deleted.
4. Confirm the targeted records are still the records selected by the reviewed source and no target has been reassigned since the review.
5. Confirm `setores`, `funcoes`, `setores_funcoes`, `setores_aliases`, `funcoes_aliases` and `funcionarios.funcao_id` are present.
6. Capture the governed D1 recovery point immediately before mutation.

## Postconditions
1. Exactly one Schema V2 ledger row exists for change `organizational-structure-pj-normalization-0525`.
2. All 13 bounded employee records have non-null canonical `setor_id` and `funcao_id`.
3. Every bounded employee sector-function pair exists as one active `setores_funcoes` row.
4. `Diretoria` and `TI` exist once as active tenant-6 sectors.
5. All 13 reviewed functions resolve to one active tenant-6 function each.
6. No bounded employee retains a `TEMP-TRN-*` matricula.
7. No row outside `empresa_id=6` is changed.

## Rollback
Use the D1 Time Travel recovery point captured by the official Schema V2 production workflow. After a successful apply, any correction must be a reviewed forward compensation; do not restore provisional matricula values by ad hoc SQL.
