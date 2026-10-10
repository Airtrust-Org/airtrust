# Schema V2 0547 - Regras de Ouro corporate requirement

## Authority and correction
The Training Manager explicitly clarified on 2026-10-10 that the Regras de Ouro - Petrobras row of the QSMS/Safety matrix applies to all employees and must produce pending LMS enrollments for staff without valid qualification evidence or approaching renewal. This current decision supersedes the contradictory footnote decision embedded in 0546; do not alter 0546 (immutable).

## Scope
Costa do Sol tenant 6 only. Create the single company-wide OBRIGATORIA requirement for the existing, canonical and active REGRAS_OURO_PETROBRAS qualification model. Keep its reviewed validity and course/history data intact. Enable automatic eligibility for EAD enrollment. No existing matrícula, historical completion, SCORM, certificate, role or employee is changed in this schema operation. Operational reconciliation happens separately via the reviewed backend with dry-run and confirmed batches.

## Preconditions
Official main SHA and eight green gates; exact-SHA/change-specific production permission; baseline production-d1-baseline-v2-20260714 active; official 0546 ledger present and matching canonical source; exactly one active tenant-6 model REGRAS_OURO_PETROBRAS; zero active rules for this model; unique published EAD LMS course mapping must be validated before the enrollment phase.

## Postconditions
Exactly one active company-wide mandatory requirement with no condition, no function restriction and auto_matricular_ead=1. No other active Regras de Ouro requirements. Qualified staff with current evidence do not gain a new LMS cycle; only overdue, never-completed and renewal-window cases can be enrolled after dry-run.

## Rollback / recovery
Forward compensation only. Restore point governed by Schema V2; never edit 0546, run arbitrary remote SQL, rewrite qualification history or roll back unrelated tenant data. Remote apply and later enrollment writes require separate exact-SHA scope authorization.
