import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  join(process.cwd(), '..', '.github', 'workflows', 'production-frms-evidence-reprocess.yml'),
  'utf8',
);

describe('Production FRMS evidence reprocess workflow', () => {
  it('is exact-SHA, production-environment and release-gate guarded', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('EXPECTED_SHA_MISMATCH');
    expect(workflow).toContain('AIRTRUST_PRODUCTION_FRMS_EVIDENCE_REPROCESS');
    expect(workflow).toContain('verify-release-gates.mjs');
    expect(workflow).toContain('PRODUCTION_LIVE_SHA_MISMATCH');
  });

  it('requires Schema 0512/profile/catalog readiness before the operation', () => {
    expect(workflow).toContain('frms-regulatory-evidence-location-catalog-0512');
    expect(workflow).toContain('SCHEMA_0512_NOT_APPLIED');
    expect(workflow).toContain('REGULATORY_PROFILE_NOT_READY');
    expect(workflow).toContain('LOCATION_CATALOGUE_INCOMPLETE');
  });

  it('selects flight-level or leg-level crew safely and never resyncs SIGVOOS', () => {
    expect(workflow).toContain('(t.etapa_id IS NULL OR e.id=t.etapa_id)');
    expect(workflow).toContain('/api/frms/reprocessar/${id}');
    expect(workflow).not.toContain('sincronizar-frms');
    expect(workflow).not.toContain('clearExisting');
  });

  it('uses D1 only for read-only inventory/postvalidation and proves snapshot coverage', () => {
    expect(workflow).toContain('FRMS_SNAPSHOT_COVERAGE_MISMATCH');
    expect(workflow).toContain('FRMS_SNAPSHOT_PROFILE_MISMATCH');
    expect(workflow).toContain('direct D1 mutation executed by workflow: no');
    expect(workflow).not.toMatch(/wrangler d1 execute[^\n]*--file/);
    expect(workflow).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b[^\n]*frms_jornada_avaliacoes/i);
  });
});
