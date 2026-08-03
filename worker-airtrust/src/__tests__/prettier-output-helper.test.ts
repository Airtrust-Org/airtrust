import { execFileSync } from 'node:child_process';
import { describe, it } from 'vitest';

const files = [
  'src/middleware/domainEventProcessor.ts',
  'src/routes/funcionarios-mutations.ts',
  'src/routes/hospedagemHandlers.ts',
  'src/shared/eventProcessor.ts',
];

describe('canonical prettier output helper', () => {
  it('prints exact formatter output for the current lint failures', () => {
    for (const file of files) {
      const formatted = execFileSync('npx', ['--yes', 'prettier@3.9.6', file], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      console.log(`PRETTIER_OUTPUT_BEGIN:${file}`);
      console.log(Buffer.from(formatted, 'utf8').toString('base64'));
      console.log(`PRETTIER_OUTPUT_END:${file}`);
    }

    throw new Error('PRETTIER_OUTPUT_CAPTURE_COMPLETE');
  }, 120_000);
});
