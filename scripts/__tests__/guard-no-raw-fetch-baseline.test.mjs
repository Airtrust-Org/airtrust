import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  BASE_SHA,
  MIGRATED_MODULES,
  assertBaselineIntegrity,
  serializeBaseline,
} from '../guard-no-raw-fetch.mjs';

const baselineUrl = new URL('../raw-fetch-baseline.json', import.meta.url);

describe('raw fetch baseline integrity', () => {
  it('is deterministic, bound to the exact base SHA and stores no migrated debt', async () => {
    const text = await readFile(baselineUrl, 'utf8');
    const baseline = assertBaselineIntegrity(text);

    expect(baseline.baseSha).toBe(BASE_SHA);
    expect(baseline.mode).toBe('git-tree');
    expect(baseline.counts).toEqual({});
    expect(serializeBaseline(baseline)).toBe(text);
    for (const path of MIGRATED_MODULES) {
      expect(baseline.counts).not.toHaveProperty(path);
    }
  });

  it('rejects a baseline adulterated upward', async () => {
    const text = await readFile(baselineUrl, 'utf8');
    const baseline = JSON.parse(text);
    baseline.counts['src/react-app/pages/qualificacoes/LicencasTab.tsx'] = {
      rawFetch: 99,
      apiFetch: 99,
    };
    const tampered = `${JSON.stringify(baseline, null, 2)}\n`;

    expect(() => assertBaselineIntegrity(tampered)).toThrow(/baseline.*integridade/i);
  });
});
