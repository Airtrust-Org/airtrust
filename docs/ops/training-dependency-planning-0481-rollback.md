# Training Dependency Planning 0481 — rollback / compensation

This compensation is intentionally non-destructive. It disables the approved AW139 dependency rule and drops only the runtime triggers introduced by 0481. It does not delete historical qualifications, dependency events, simulator-planning proposals, participant rows, or planning audit records.

Use only through the applicable governed schema/data-change process after capturing the required recovery point. If generated proposals must later be cancelled, that is a separate reviewed operational/data change.
