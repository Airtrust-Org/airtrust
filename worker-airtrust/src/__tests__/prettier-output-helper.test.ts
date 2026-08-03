import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';

const files = [
  'worker-airtrust/src/middleware/domainEventProcessor.ts',
  'worker-airtrust/src/routes/admin-domain-events.ts',
  'worker-airtrust/src/shared/eventProcessor.ts',
  'worker-airtrust/src/utils/auditoria.ts',
];

describe('canonical prettier output helper', () => {
  it('prints exact formatter output for the changed runtime files', () => {
    for (const file of files) {
      const formatted = execFileSync('npx', ['--yes', 'prettier@3.9.6', file], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      console.log(`PRETTIER_OUTPUT_BEGIN:${file}`);
      console.log(Buffer.from(formatted, 'utf8').toString('base64'));
      console.log(`PRETTIER_OUTPUT_END:${file}`);
    }
  }, 120_000);
});
