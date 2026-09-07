# Staging migrations directory intentionally disabled

This directory intentionally contains no SQL migrations.

The staging D1 binding points `migrations_dir` here so a generic
`wrangler d1 migrations apply --env staging --remote` invocation cannot
enumerate or replay the historical `worker-airtrust/migrations/` chain.

Official staging schema changes use explicit, allowlisted governed runners
under `scripts/staging/`. Those runners resolve the reviewed SQL file path
directly, perform target/preflight/recovery/ledger/postcondition checks, and
do not depend on Wrangler's configured `migrations_dir`.

Do not place SQL files in this directory.
