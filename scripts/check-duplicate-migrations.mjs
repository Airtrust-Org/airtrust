#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMigrationsDirectory } from './migration-directory-policy.mjs';

export function checkDuplicateMigrations(directory = path.join(process.cwd(), 'worker-airtrust', 'migrations')) {
  const result = inspectMigrationsDirectory(directory);
  const duplicates = result.violations.filter((violation) => violation.type === 'duplicate_prefix');
  return {
    ok: duplicates.length === 0,
    directory: result.directory,
    duplicates,
    historicalDuplicateExceptions: result.historicalDuplicateExceptions,
  };
}

function main() {
  const result = checkDuplicateMigrations();
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
