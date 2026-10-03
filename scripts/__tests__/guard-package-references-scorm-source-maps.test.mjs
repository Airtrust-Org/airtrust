import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const guardSource = readFileSync(resolve('scripts/guard-package-references.mjs'), 'utf8');

describe('SCORM source-map package guard', () => {
  it('checks tracked SCORM package source maps and manifest references', () => {
    expect(guardSource).toContain('SCORM_SOURCE_MAP:');
    expect(guardSource).toContain('SCORM_SOURCE_MAP_REF:');
    expect(guardSource).toContain("file.toLowerCase().endsWith('.map')");
    expect(guardSource).toContain("hrefPath.endsWith('.map')");
  });
});
