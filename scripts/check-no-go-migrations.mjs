#!/usr/bin/env node
// Lists every SQL artifact explicitly marked NO_GO_MIGRATION_PRODUCAO.
// Canonical migrations must contain none; blocked historical/manual SQL lives
// under scripts/sql/manual/no-go and remains visible to CI and reviewers.

import path from 'node:path';
import { listNoGoMigrations } from './migration-no-go-lib.mjs';

const roots = [
  ['canonical', path.join(process.cwd(), 'worker-airtrust', 'migrations')],
  ['manual-no-go', path.join(process.cwd(), 'scripts', 'sql', 'manual', 'no-go')],
];

let total = 0;
for (const [label, directory] of roots) {
  const blocked = listNoGoMigrations(directory);
  total += blocked.length;
  console.log(`[no-go-migrations:${label}] ${blocked.length} file(s):`);
  for (const name of blocked) console.log(`  - ${name}`);
  if (label === 'canonical' && blocked.length > 0) {
    console.error('ERROR: NO_GO SQL must never remain in worker-airtrust/migrations.');
    process.exitCode = 1;
  }
}
console.log(`[no-go-migrations] total blocked artifacts: ${total}`);
