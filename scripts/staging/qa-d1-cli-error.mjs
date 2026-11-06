// Staging-only diagnostics for the synthetic Compliance lifecycle D1 CLI.
// Never expose raw Wrangler stdout/stderr: it can contain SQL or credentials.
// Only the finite allowlisted classification may appear in CI logs.
export function classifyQAD1CliError({ stderr = '', stdout = '', error = null } = {}) {
  const diagnostic = `${String(stderr).slice(0, 30000)} ${String(stdout).slice(0, 30000)} ${String(error?.code || '')}`;
  if (/no such column/i.test(diagnostic)) return 'SQLITE_NO_SUCH_COLUMN';
  if (/no such table/i.test(diagnostic)) return 'SQLITE_NO_SUCH_TABLE';
  if (/FOREIGN KEY constraint failed|SQLITE_CONSTRAINT_FOREIGNKEY/i.test(diagnostic)) return 'SQLITE_FOREIGN_KEY';
  if (/UNIQUE constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(diagnostic)) return 'SQLITE_UNIQUE_CONSTRAINT';
  if (/CHECK constraint failed|SQLITE_CONSTRAINT_CHECK/i.test(diagnostic)) return 'SQLITE_CHECK_CONSTRAINT';
  if (/NOT NULL constraint failed|SQLITE_CONSTRAINT_NOTNULL/i.test(diagnostic)) return 'SQLITE_NOT_NULL_CONSTRAINT';
  if (/SQLITE_CONSTRAINT/i.test(diagnostic)) return 'SQLITE_CONSTRAINT';
  if (/SQLITE_BUSY|database is locked|database is busy/i.test(diagnostic)) return 'SQLITE_BUSY';
  if (/\b429\b|rate.?limit|too many requests/i.test(diagnostic)) return 'RATE_LIMIT';
  if (/\b403\b|\b401\b|authentication error|permission denied|unauthorized/i.test(diagnostic)) return 'AUTH_DENIED';
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|network error|socket hang up/i.test(diagnostic)) return 'NETWORK';
  if (/no such function|SQLITE_ERROR|D1_ERROR|syntax error/i.test(diagnostic)) return 'SQLITE_ERROR';
  if (error?.code === 'ENOENT') return 'CLI_UNAVAILABLE';
  return 'UNCLASSIFIED';
}
