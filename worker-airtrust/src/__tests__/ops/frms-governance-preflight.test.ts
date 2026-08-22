import { describe, expect, it } from 'vitest';
import {
  releaseContainsFrmsGovernance,
  resolveProductionD1Name,
  evaluateFrmsGovernancePreflight,
  GOVERNANCE_MIGRATION_FILENAME,
} from '../../../../scripts/lib/frms-governance-preflight-contract.mjs';

const WRANGLER_TOML_FIXTURE = `
[[env.development.d1_databases]]
binding = "DB"
database_name = "airtrust-db-dev"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "airtrust-db-staging-baseline-20260701"

[env.production]
name = "airtrust-api-production"

[env.production.vars]
FOO = "bar"

[[env.production.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage"

[[env.production.d1_databases]]
binding = "DB"
database_name = "airtrust-db"
database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

[env.production.ai]
binding = "AI"
`;

describe('releaseContainsFrmsGovernance', () => {
  it('D) SHA anterior à governança: guard FRMS não requerido', () => {
    expect(releaseContainsFrmsGovernance(['0001_init.sql', '0463_frms_iogp_schema_v2.sql'])).toBe(false);
  });

  it('detects governance when the migration is present', () => {
    expect(releaseContainsFrmsGovernance(['0001_init.sql', GOVERNANCE_MIGRATION_FILENAME])).toBe(true);
  });
});

describe('resolveProductionD1Name', () => {
  it('resolves the production database_name from the official wrangler.toml', () => {
    expect(resolveProductionD1Name(WRANGLER_TOML_FIXTURE, undefined)).toBe('airtrust-db');
  });

  it('honors an explicit override for local/manual runs', () => {
    expect(resolveProductionD1Name(WRANGLER_TOML_FIXTURE, 'airtrust-db-dev')).toBe('airtrust-db-dev');
  });

  it('C) SHA com governança + D1 não resolvível: fail-closed (throws, never returns a fallback)', () => {
    expect(() => resolveProductionD1Name('no env sections here', undefined)).toThrow(
      /could not locate \[\[env\.production\.d1_databases\]\]/,
    );
    expect(() =>
      resolveProductionD1Name('[[env.production.d1_databases]]\nbinding = "DB"\n', undefined),
    ).toThrow(/could not resolve database_name/);
  });
});

describe('evaluateFrmsGovernancePreflight', () => {
  it('E) ausência de override não pode causar skip silencioso quando required=true', () => {
    const verdict = evaluateFrmsGovernancePreflight({ required: true, tenantResults: undefined });
    expect(verdict.status).toBe('FAIL');
  });

  it('D) guard não requerido: SKIPPED, não PASS nem FAIL', () => {
    const verdict = evaluateFrmsGovernancePreflight({ required: false, tenantResults: undefined });
    expect(verdict.status).toBe('SKIPPED');
  });

  it('A) SHA com governança + readiness PASS: preflight PASS', () => {
    const verdict = evaluateFrmsGovernancePreflight({
      required: true,
      tenantResults: [{ empresaId: 1, ready: true }, { empresaId: 2, ready: true }],
    });
    expect(verdict.status).toBe('PASS');
  });

  it('B) SHA com governança + readiness NOT_READY: preflight FAIL', () => {
    const verdict = evaluateFrmsGovernancePreflight({
      required: true,
      tenantResults: [{ empresaId: 1, ready: true }, { empresaId: 2, ready: false, reason: 'ASSIGNMENT_MISSING' }],
    });
    expect(verdict.status).toBe('FAIL');
    expect(verdict.notReady).toHaveLength(1);
  });

  it('C) SHA com governança + D1 não resolvível (tenantResults undefined): preflight FAIL, nunca PASS', () => {
    const verdict = evaluateFrmsGovernancePreflight({ required: true, tenantResults: undefined });
    expect(verdict.status).toBe('FAIL');
    expect(verdict.reason).toMatch(/could not be determined/);
  });

  it('sem nenhum tenant com atividade FRMS: PASS vacuamente (nada a bloquear)', () => {
    const verdict = evaluateFrmsGovernancePreflight({ required: true, tenantResults: [] });
    expect(verdict.status).toBe('PASS');
  });
});
