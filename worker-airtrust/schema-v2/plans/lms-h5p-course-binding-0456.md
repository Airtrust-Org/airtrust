# Schema V2 — LMS H5P course binding (0456)

## Scope

Add nullable `lms_cursos.h5p_conteudo_id` and indexes so a course points to one explicit H5P row. Titles remain display-only and never participate in lookup or reconciliation.

## Preconditions

- apply only through the official Schema V2 workflow;
- backup/recovery point available;
- exact target database/environment confirmed;
- no duplicate active `(empresa_id, h5p_conteudo_id)` bindings;
- review legacy H5P rows where exact `(empresa_id, r2_key)` match is absent or ambiguous.

## Reconciliation

The migration backfills only when exactly one active H5P row has the same tenant and exact `r2_key` already stored by the course. Ambiguous or missing rows remain `NULL`; no title-based fallback is allowed.

Postcondition query:

```sql
SELECT c.id, c.empresa_id, c.titulo, c.scorm_package_r2_prefix
FROM lms_cursos c
WHERE c.tipo_conteudo = 'h5p'
  AND c.deleted_at IS NULL
  AND c.h5p_conteudo_id IS NULL;
```

Every returned row requires controlled reconciliation before enforcing a future NOT NULL contract.

## Rollback

Use `scripts/rollback/0456_lms_h5p_course_binding.sql` only after backup and confirmation that the deployed runtime no longer reads/writes the new column. Exact tenant + R2-key compatibility remains available during rollback.

## This PR

The migration is versioned but is not applied locally, to staging, or to production by this PR.
