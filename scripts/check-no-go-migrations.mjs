#!/usr/bin/env node
// Lists migrations explicitly marked NO_GO_MIGRATION_PRODUCAO so CI keeps a
// visible, versioned record of what is blocked from production execution.
// This check never fails the build by itself — it is a visibility gate, not
// an approval gate. The actual block happens at execution time in
// scripts/apply-migration-production.sh, which reads the same marker via
// migration-no-go-lib.mjs.

import path from 'node:path';
import { listNoGoMigrations } from './migration-no-go-lib.mjs';

const migrationsDir = path.join(process.cwd(), 'worker-airtrust', 'migrations');
const blocked = listNoGoMigrations(migrationsDir);

console.log(`[no-go-migrations] ${blocked.length} migration(s) marked NO_GO_MIGRATION_PRODUCAO:`);
for (const name of blocked) {
  console.log(`  - ${name}`);
}
