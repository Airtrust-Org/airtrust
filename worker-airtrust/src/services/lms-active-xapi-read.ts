/**
 * Read-only compatibility across the governed Schema V2 0557 rollout.
 *
 * Before 0557 no xAPI row can have archived_cycle_id and the original
 * tenant/matricula-scoped SELECT remains correct. After 0557 every terminal
 * query MUST exclude historical rows. Only fall back on the precise SQLite
 * "missing archive column" error, and independently confirm the column is
 * absent before retrying a SELECT. All other failures remain fail-closed.
 *
 * Renewal/write paths NEVER use this fallback: they require 0557.
 */
const ARCHIVE_FILTER = /\s+AND\s+(?:x\.)?archived_cycle_id\s+IS\s+NULL\b/gi;
const MISSING_COLUMN = /\bno such column:\s*(?:[A-Za-z_][A-Za-z0-9_]*\.)?archived_cycle_id\b/i;

async function legacyXapiQuery(db: D1Database, sql: string, error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : String(error);
  if (!MISSING_COLUMN.test(message)) throw error;
  const legacySql = sql.replace(ARCHIVE_FILTER, '');
  if (legacySql === sql) throw error;
  const column = await db.prepare(
    "SELECT 1 AS present FROM pragma_table_info('lms_xapi_statements') " +
    "WHERE name='archived_cycle_id' LIMIT 1",
  ).first<{ present: number }>();
  if (column) throw error; // Column exists: this is not an authorized fallback.
  return legacySql;
}

export async function activeXapiFirst<T>(
  db: D1Database, sql: string, args: unknown[],
): Promise<T | null> {
  try {
    return await db.prepare(sql).bind(...args).first<T>();
  } catch (error) {
    const legacySql = await legacyXapiQuery(db, sql, error);
    return db.prepare(legacySql).bind(...args).first<T>();
  }
}

export async function activeXapiAll<T>(
  db: D1Database, sql: string, args: unknown[],
) {
  try {
    return await db.prepare(sql).bind(...args).all<T>();
  } catch (error) {
    const legacySql = await legacyXapiQuery(db, sql, error);
    return db.prepare(legacySql).bind(...args).all<T>();
  }
}
