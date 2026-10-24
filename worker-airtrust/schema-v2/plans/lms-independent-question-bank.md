# REVIEW-ONLY — Banco de Questões e Provas (#1661)

Candidate `lms-independent-question-bank.REVIEW-ONLY.sql.txt` is **not** an applicable Schema V2 change. It has no numbered change, registry manifest, plan SHA or rollout grant. No D1 changes were made.

## Intended schema
- `lms_exam_question_revisions`: immutable tenant/course/question/revision identity; editable DRAFT with optimistic `edit_version`; independent REVIEWED; PUBLISHED immutable with content digest.
- `lms_exam_question_audit`: append-only audit of state changes, without question/answer content.
- Tenant/course trigger verifies the existing `lms_cursos` row belongs to same `empresa_id`. No implicit cross-tenant foreign key.
- Trigger rejects published revision edits and deletes, illegal lifecycle, modified identity and a new revision unless its immediate predecessor is published.
- Separate exams/attempts, access control, schema V2 numbered migration and current-worker integration remain **future work**, not implied by these tables.

## Before schema authorization
1. Check main schema numbering and full Schema V2 registry, identify conflict-free number.
2. Offline SQLite test actual DDL against a representative `lms_cursos` table and tenant/cross-tenant, concurrency, immutable states and append-only audit. Then run architecture/SQL guards.
3. Add real FK/tenant identity contract review, baseline/preimage plan and hash, recovery strategy, signed manifest and postchecks; never assume a file equals a remote migration.
4. Implement authenticated admin API limited to authorized LMS role, explicitly scoped by tenant and course, with parameterized SQL and expected edit_version, transactional readback and protected audit.
5. Run focused integration tests and eight official gates. Only a specifically authorized Schema V2 staging workflow can apply. Production requires separate scoped authorization.

## Rollback
No remote schema change permitted from this candidate. Once a reviewed migration is applied, SQLite schema rollback/destructive drops on a shared D1 are **not** allowed without separate recovery/compensation plan and tenant impact review.
