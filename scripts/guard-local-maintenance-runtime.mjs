#!/usr/bin/env node
/** Prevent the local-only maintenance contract from being shipped remotely. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateLocalMaintenanceConfig({ wrangler, packageJson }) {
  const failures = [];
  for (const environment of ['staging', 'production']) {
    const section = wrangler.match(new RegExp(`\\[env\\.${environment}\\.vars\\][\\s\\S]*?(?=\\n\\[|\\n\\[\\[|$)`))?.[0] ?? '';
    for (const forbidden of [
      'ENABLE_LOCAL_MAINTENANCE = "true"',
      'LOCAL_MAINTENANCE_RUNTIME = "true"',
      'ENVIRONMENT = "development"',
    ]) {
      if (section.includes(forbidden)) failures.push(`${environment} must not contain ${forbidden}`);
    }
  }
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (/maintenance.*local|local.*maintenance/i.test(name) && /--remote\b/.test(String(command))) {
      failures.push(`local maintenance script ${name} must not use --remote`);
    }
  }
  if (/ENABLE_DEV_AUTH_BYPASS[^\n]*(ENABLE_LOCAL_MAINTENANCE|LOCAL_MAINTENANCE_RUNTIME)/.test(wrangler)) {
    failures.push('ENABLE_DEV_AUTH_BYPASS must not substitute the local maintenance contract');
  }
  return failures;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = validateLocalMaintenanceConfig({
  wrangler: readFileSync(join(root, 'worker-airtrust/wrangler.toml'), 'utf8'),
  packageJson: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
});
if (failures.length) {
  console.error('guard:local-maintenance-runtime FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('OK: guard:local-maintenance-runtime');
