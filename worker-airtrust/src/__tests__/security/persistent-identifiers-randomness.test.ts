import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relative: string) =>
  readFileSync(resolve(process.cwd(), relative), 'utf8');

describe('persistent identifier randomness', () => {
  it('uses cryptographic UUIDs for persisted SIGVOOS event identifiers', () => {
    const cron = readSource('src/cron/scheduled-handler.ts');
    const frms = readSource('src/routes/frms.ts');

    expect(cron).toContain('evt_${Date.now()}_${crypto.randomUUID()}');
    expect(frms).toContain('evt_${Date.now()}_${crypto.randomUUID()}');
    expect(cron).not.toMatch(/evt_\$\{Date\.now\(\)\}[^\n]*Math\.random/);
    expect(frms).not.toMatch(/evt_\$\{Date\.now\(\)\}[^\n]*Math\.random/);
  });

  it('derives the fallback SGSO barrier code from the cryptographic barrier UUID', () => {
    const sgso = readSource('src/routes/sgso-next-gen.ts');

    expect(sgso).toContain("barreiraId.replaceAll('-', '').slice(0, 4)");
    expect(sgso).not.toMatch(/barreira\.codigo \?\?[^\n]*Math\.random/);
  });
});
