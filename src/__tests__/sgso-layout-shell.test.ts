import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const sgsoSource = readFileSync(resolve(process.cwd(), 'src/react-app/pages/Sgso.tsx'), 'utf8');

describe('SGSO module page shell', () => {
  it('uses the full module width instead of introducing a centered max-width island', () => {
    expect(sgsoSource).toContain('className="w-full space-y-8 px-4 py-6 sm:px-6 lg:px-8"');
    expect(sgsoSource).not.toContain('mx-auto w-full max-w-6xl');
  });
});
