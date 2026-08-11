#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectMigrationsDirectory } from './migration-directory-policy.mjs';

export function runMigrationsDirPurityGuard({
  root = process.cwd(),
  directory = path.join(root, 'worker-airtrust', 'migrations'),
} = {}) {
  return inspectMigrationsDirectory(directory);
}

function main() {
  const args = process.argv.slice(2);
  let directory;
  let dryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--dir') directory = args[++index];
    else if (arg.startsWith('--dir=')) directory = arg.slice('--dir='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  const result = runMigrationsDirPurityGuard({
    directory: directory ? path.resolve(directory) : undefined,
  });
  const output = {
    ...result,
    mode: dryRun ? 'dry-run' : 'guard',
    message: dryRun
      ? 'Exact files eligible for canonical migration enumeration are listed in candidateFiles.'
      : 'Canonical migrations directory purity check.',
  };
  const stream = result.ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
