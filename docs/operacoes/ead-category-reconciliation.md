# EAD category reconciliation executor

This is a closed, one-off incident executor for Costa do Sol (`empresa_id=6`).
It is not a migration console and never accepts SQL, table names, tenant IDs,
or record lists from a client.

The four endpoints are admin-only and require an authenticated user whose tenant
is 6. `dry-run` and `verify` are read-only. `apply` requires the exact dry-run
hash, source SHA, Worker version, an explicit confirmation, and a new `run_uuid`.
Before D1 changes, it creates a deterministic tenant-scoped snapshot in R2 and
reads it back to verify its SHA-256. A previous successful run permanently
closes new applies. `rollback` uses that same verified snapshot and only restores
the exact post-apply state; drift fails closed.

The executor corrects only strict legacy EAD evidence (the old EAD format,
canonical EAD category, or an LMS-linked EAD record). It refuses ambiguous LMS
courses and does not update any other tenant or any true Teórico record.
