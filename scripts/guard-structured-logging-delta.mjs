import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A-07 starts with these deliberately small route modules. Expanding this
// list is a conscious migration step; a listed module cannot regress to raw logs.
const migratedModules = [
  'worker-airtrust/src/routes/frms-readiness.ts',
  'worker-airtrust/src/routes/lms-progresso.ts',
  'worker-airtrust/src/routes/escalas-crud.ts',
  'worker-airtrust/src/lib/lms/lms-schema-state.ts',
  'worker-airtrust/src/routes/lms-matriculas.ts',
];

const rawConsole = /\bconsole\s*\.\s*(?:log|info|warn|error|debug)\s*\(/g;
const violations = [];

for (const relativePath of migratedModules) {
  const source = readFileSync(resolve(relativePath), 'utf8');
  if (rawConsole.test(source)) violations.push(relativePath);
  rawConsole.lastIndex = 0;
}

if (violations.length > 0) {
  console.error(
    `guard:structured-logging FAILED — raw console calls are forbidden in migrated modules:\n${violations.join('\n')}`,
  );
  process.exit(1);
}

console.log(`guard:structured-logging OK — ${migratedModules.length} migrated modules checked`);
