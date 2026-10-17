# Schema V2 0553 — Retire empty LGPD placeholder model

## Scope

Read-only production inspection confirmed that tenant-6 model `LGPD_SEG_INFO` has no active historical completion, LMS course, enrolment, requirement, training-matrix row, planned training, or sector link. The user authorized deleting qualification models once their active links are zero.

This change soft-deletes only that empty model. It does not transfer or create historical data, LMS records, certificates, notifications, or requirements.

## Preconditions and postconditions

The SQL refuses to run if any active reference is present. After governed application, the model is inactive with `deleted_at` set and each checked reference remains zero. The workflow captures a D1 Time Travel recovery point and verifies the exact Schema V2 ledger row.
