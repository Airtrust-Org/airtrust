// Shared detection logic for migrations explicitly blocked from production execution.
// Single source of truth: both the CI guard (check-no-go-migrations.mjs) and the
// production apply wrapper (apply-migration-production.sh, via this file) read the
// same marker so there is exactly one place that defines what "NO_GO" means.

import fs from 'node:fs';
import path from 'node:path';

export const NO_GO_MARKER_PATTERN = /^--\s*NO_GO_MIGRATION_PRODUCAO\b/m;

export function isNoGoMigrationContent(sqlContent) {
  return NO_GO_MARKER_PATTERN.test(sqlContent);
}

export function isNoGoMigrationFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return isNoGoMigrationContent(content);
}

export function listNoGoMigrations(migrationsDir) {
  return fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .filter((name) => isNoGoMigrationFile(path.join(migrationsDir, name)))
    .sort();
}
