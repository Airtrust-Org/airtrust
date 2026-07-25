/**
 * Builds the exact "migration content + ledger INSERT" text that a
 * ledger-aware remote migration apply must submit as ONE atomic unit.
 *
 * `wrangler d1 migrations apply` builds this same combined text internally,
 * then submits it via the D1 `query` API action (the same lightweight path
 * used by `d1 execute --command`). That path was empirically found to fail
 * with `SQLITE_ERROR: incomplete input` on migrations 0440 and 0443 —
 * both large, trigger-heavy files — while the exact same combined text
 * submitted via the `import` API action (`d1 execute --remote --file`,
 * which uploads the file and lets D1 process it server-side) succeeds
 * every time. Migrations 0441/0442, smaller and structurally simpler,
 * happened to stay under whatever complexity ceiling the `query` action
 * has, which is why they applied successfully in production through the
 * old runner despite the same latent defect.
 *
 * This function only builds the text; it never executes anything and never
 * touches a network connection or database — the caller is responsible for
 * writing the result to a file and submitting it via the `--file` transport.
 */
export function buildLedgerAppliedSql({ migrationSql, migrationName, migrationsTableName = 'd1_migrations' }) {
  if (typeof migrationSql !== 'string' || !migrationSql.trim()) {
    throw new Error('migrationSql vazio ou ausente');
  }
  if (typeof migrationName !== 'string' || !/^[\w.-]+\.sql$/.test(migrationName)) {
    throw new Error(`migrationName inválido: ${migrationName}`);
  }
  if (typeof migrationsTableName !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(migrationsTableName)) {
    throw new Error(`migrationsTableName inválido: ${migrationsTableName}`);
  }
  const escapedName = migrationName.replace(/'/g, "''");
  const trimmed = migrationSql.replace(/\s+$/u, '');
  return `${trimmed}\n\nINSERT INTO ${migrationsTableName} (name) VALUES ('${escapedName}');\n`;
}
