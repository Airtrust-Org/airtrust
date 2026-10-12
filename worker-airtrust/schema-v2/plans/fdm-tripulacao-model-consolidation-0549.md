# Schema V2 0549 — FDM Tripulação model consolidation

## Verified baseline and decision

Read-only production D1 inspection on 2026-10-11 confirmed tenant 6 has one active legacy model `FDM-TRIPULACAO` and one active canonical model `FDM_TRIP`. Course 71 is the published SCORM course carrying 11 active enrolments: nine completed and two still open. It is bound to the legacy model. Course 74 is an empty, unpublished FDM course already bound to the canonical model. The legacy model has nine active historical completions and two active function-scoped requirements; the canonical model has neither.

The requested consolidation moves the course-71 binding, historical qualification identity and two requirements to `FDM_TRIP`, then soft-deletes `FDM-TRIPULACAO`. It preserves course 71, all enrolment states, SCORM assets, historical dates, certificate links, and the unused course 74.

## Preconditions and fail-closed behavior

The production baseline `production-d1-baseline-v2-20260714` must be active. The change is rejected if any observed count or course state differs: source/target model uniqueness, nine source history rows, course 71 and its 11 enrolments (nine completed and two open), course 74 empty/unpublished state, two source requirements, no target requirements, and no source planned or legacy matrix rows.

Production application requires the reviewed manifest and exact main SHA, a D1 Time Travel recovery point, production environment approval, and the workflow preflight. No notification, enrolment, SCORM attempt, grade, certificate, or content write is performed.

## Postconditions

After governed application, `FDM_TRIP` owns nine active histories, two active requirements and the published course 71 with the same 11 enrolments and status split. `FDM-TRIPULACAO` is inactive with no active historical, course or requirement reference. Course 74 remains unchanged and empty.

## Recovery

Record the official D1 Time Travel recovery point before the apply. If a postcondition fails, stop and use that recovery point under the separate reviewed production recovery process. Any compensating change must be separately reviewed and tied to the exact affected rows.
