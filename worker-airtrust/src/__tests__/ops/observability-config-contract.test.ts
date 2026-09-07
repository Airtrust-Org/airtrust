import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('remote Worker observability contract', () => {
  const wrangler = readFileSync(resolve(process.cwd(), 'wrangler.toml'), 'utf8');
  const runbook = readFileSync(resolve(process.cwd(), '../docs/ALERTING_SETUP.md'), 'utf8');

  it('persists logs in staging and production', () => {
    expect(wrangler).toMatch(/\[env\.staging\.observability\][\s\S]*?enabled = true[\s\S]*?head_sampling_rate = 1/);
    expect(wrangler).toMatch(/\[env\.production\.observability\][\s\S]*?enabled = true[\s\S]*?head_sampling_rate = 1/);
  });

  it('does not claim external alert delivery without runtime evidence', () => {
    expect(runbook).toContain('NÃO COMPROVADO / REQUER CONFIGURAÇÃO EXTERNA');
    expect(runbook).toContain('https://api.airtrust.online/api/health');
    expect(runbook).not.toContain('**Status:** ✅ CONFIGURED');
    expect(runbook).not.toContain('https://airtrust.workers.dev/api/v2/system/health');
  });
});
