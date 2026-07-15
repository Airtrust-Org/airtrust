#!/usr/bin/env node
// Prints BLOCKED or OK for a single migration file. Used by
// apply-migration-production.sh so the bash wrapper never has to
// re-implement the NO_GO detection logic itself.

import { isNoGoMigrationFile } from './migration-no-go-lib.mjs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('usage: node scripts/check-single-migration-no-go.mjs <path>');
  process.exit(2);
}

process.stdout.write(isNoGoMigrationFile(filePath) ? 'BLOCKED' : 'OK');
