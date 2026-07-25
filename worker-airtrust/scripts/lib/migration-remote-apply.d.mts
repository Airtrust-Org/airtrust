export function buildLedgerAppliedSql(input: {
  migrationSql: string;
  migrationName: string;
  migrationsTableName?: string;
}): string;
