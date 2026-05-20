# Production → Local Data Sync

Sync selected canonical tables from the production D1 database to your local D1 instance to reproduce real scenarios in development.

Tables:

- `funcionarios`
- `qualificacoes_tipos`
- `qualificacoes_historico`

## Prerequisites

- `wrangler` configured with your Cloudflare account
- D1 binding names available in `wrangler.toml`
- `jq` installed

## Usage

```bash
# From repo root
chmod +x scripts/sync-prod-to-local.sh
# Run with production binding (remote) → local binding
DB_PROD=airtrust-db DB_LOCAL=airtrust-db REMOTE=1 ./scripts/sync-prod-to-local.sh
```

- `DB_PROD`: Name of the production D1 database binding (as configured in `wrangler.toml`).
- `DB_LOCAL`: Name of your local D1 database (usually same name; omitting `--remote` targets local).
- `REMOTE`: Set to `1` to fetch from production; set to `0` to copy between two local DBs.

## What the script does

1. Exports each table from production to JSON via `wrangler d1 execute --remote --json`.
2. Generates SQL with proper escaping using `jq`.
3. Clears local tables and resets their AUTOINCREMENT sequence.
4. Imports rows using `INSERT OR REPLACE` inside a transaction (order: `funcionarios`, `qualificacoes_tipos`, then `qualificacoes_historico`).

## Notes

- The schema must already match the canonical migrations (0095–0097). Run migrations/build before syncing.
- The script preserves production `id` values for reliable cross-references in `qualificacoes_historico`.
- If you only want a subset, edit the `SELECT` clauses inside the script and add `WHERE` filters.

## Validate

After syncing, you can quickly verify totals:

```bash
wrangler d1 execute $DB_LOCAL --command "SELECT COUNT(*) FROM funcionarios;"
wrangler d1 execute $DB_LOCAL --command "SELECT COUNT(*) FROM qualificacoes_tipos;"
wrangler d1 execute $DB_LOCAL --command "SELECT COUNT(*) FROM qualificacoes_historico;"
```

## Troubleshooting

- If you see `jq: Cannot index object with number`, ensure `--remote` resolves and returns JSON; run the `wrangler d1 execute ... --json` command directly to inspect output.
- Ensure `wrangler.toml` has the correct `d1_databases` binding and environment (`[env.production]`) if you use `--remote`.
- If you hit payload limits, consider splitting inserts (filter by date or paginate by `id`).
