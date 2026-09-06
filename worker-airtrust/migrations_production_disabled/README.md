# Production generic migrations disabled

This directory intentionally contains no SQL migrations.

The production D1 binding points `migrations_dir` here so a generic
`wrangler d1 migrations apply --env production --remote` invocation cannot
enumerate or replay the historical `worker-airtrust/migrations/` chain.

Production schema changes use the governed Schema V2 workflow with one
explicit reviewed change file, exact hashes, recovery point, atomic ledger
write and post-validation.

Do not add `.sql` files to this directory.
