import { describe, expect, it } from 'vitest';
import type { EdbDraft } from '../../services/edb/domain-contracts';
import { evaluateEdbShadowDivergence } from '../../services/edb/shadow-divergence-engine';

function source(kind: EdbDraft['legs'][number]['source']['kind'] = 'AIRTRUST_CONTROL_FLIGHTS') {
  return {
    kind,
    reference: 'sensitive-source-reference',
    observedAt: '2026-08-02T10:00:00-03:00',
  };
}

function crew(displayName: string, canac: string, functionCode: 'P1' | 'P2') {
  return {
    personReference: `synthetic-person:${canac}`,
    displayName,
    canac,
    function: functionCode,
    reportTime: '07:00',
    contractualBase: 'SBXX',
    source: source(),
  };
}

function fuel(value: number, unit: 'KG' | 'LB' | 'L' = 'KG') {
  return {
    value,
    unit,
    source: source(),
  };
}

function leg(sequence: number, picName: string, picCanac: string): EdbDraft['legs'][number] {
  return {
    sequence,
    operationalDate: '2026-08-02',
    origin: sequence === 1 ? 'SBXX' : 'PLAT-01',
    destination: sequence === 1 ? 'PLAT-01' : 'SBXX',
    timezone: 'America/Sao_Paulo',
    engineStartTime: '08:00',
    takeoffTime: '08:10',
    landingTime: '09:00',
    engineShutdownTime: '09:10',
    times: {
      blockMinutes: 70,
      takeoffToLandingMinutes: 50,
      dayMinutes: 50,
      nightMinutes: 0,
      vfrMinutes: 20,
      ifrActualMinutes: 30,
      ifrSimulatedMinutes: 0,
    },
    dayLandings: 1,
    nightLandings: 0,
    cycles: 1,
    fuelAtEngineStart: fuel(98765.432),
    fuelAtEngineShutdown: fuel(610),
    fuelConsumed: fuel(240),
    fuelAdded: fuel(0),
    personsOnBoard: 73,
    payload: 54321.987,
    payloadUnit: 'KG',
    flightNatureCode: 'TRANSPORTE',
    crew: [
      crew(picName, picCanac, 'P1'),
      crew(`Synthetic SIC ${sequence}`, `76543210${sequence}`, 'P2'),
    ],
    occurrenceSummary: 'Sensitive occurrence free text',
    technicalDiscrepancySummary: 'Sensitive discrepancy free text',
    source: source(),
  };
}

function buildDraft(): EdbDraft {
  return {
    schemaVersion: 'edb.draft.v1',
    draftId: '00000000-0000-4000-8000-000000000009',
    tenantId: 7,
    status: 'shadow_draft',
    createdAt: '2026-08-02T10:00:00-03:00',
    sourceFlightReference: 'sensitive-flight-reference',
    operator: {
      legalName: 'Sensitive Operator Name',
      legalIdentifier: '00000000000000',
      operatingCertificate: 'COA-SENSITIVE',
    },
    owner: {
      legalName: 'Sensitive Owner Name',
      legalIdentifier: '11111111111111',
    },
    aircraft: {
      manufacturer: 'Synthetic Manufacturer',
      model: 'Synthetic Model',
      serialNumber: 'SERIAL-SENSITIVE',
      registration: 'PR-PII',
    },
    volumeNumber: '01/PR-PII/2026',
    legs: [
      leg(1, 'Sensitive PIC Alpha', '9876543210'),
      leg(2, 'Sensitive PIC Bravo', '8765432109'),
    ],
    technicalStatus: {
      lastMaintenanceIntervention: 'Sensitive maintenance intervention',
      nextMaintenanceIntervention: 'Sensitive next maintenance action',
      airframeHoursRemaining: 42.5,
      returnToServiceReference: 'RTS-SENSITIVE-001',
      openDiscrepancyCount: 1,
      source: source('MAINTENANCE_SYSTEM'),
    },
  };
}

function cloneDraft(value: EdbDraft): EdbDraft {
  return structuredClone(value);
}

function collectScalarValues(value: unknown, output: unknown[] = []): unknown[] {
  if (value === null || typeof value !== 'object') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectScalarValues(item, output);
    return output;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    collectScalarValues(item, output);
  }
  return output;
}

describe('eDB shadow divergence engine', () => {
  it('returns a deterministic ready result when no divergence exists', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);

    const first = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });
    const second = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      caseResult: 'matched',
      recommendation: 'continue',
      maxSeverity: 'NONE',
      readiness: { score: 100, status: 'ready' },
      metrics: { divergenceCount: 0 },
    });
    expect(first.evidence.fingerprint).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it('treats an unknown field as a sanitized informative divergence', () => {
    const draft = buildDraft() as EdbDraft & Record<string, unknown>;
    draft['Sensitive Person Unknown Field'] = 'Sensitive unknown value';

    const result = evaluateEdbShadowDivergence({
      expectedTenantId: 7,
      draft,
      reference: buildDraft(),
    });

    expect(result.caseResult).toBe('divergent');
    expect(result.recommendation).toBe('continue');
    expect(result.countsByCategory.UNKNOWN_FIELD).toBe(1);
    expect(result.affectedFields).toEqual(['unknown_fields.0']);
    expect(JSON.stringify(result)).not.toContain('Sensitive Person Unknown Field');
    expect(JSON.stringify(result)).not.toContain('Sensitive unknown value');
  });

  it('classifies an unmapped role as relevant and requires review', () => {
    const draft = buildDraft();
    const result = evaluateEdbShadowDivergence({
      expectedTenantId: 7,
      draft,
      reference: cloneDraft(draft),
      projectionFindings: [{ code: 'CREW_ROLE_UNMAPPED', path: 'legs.0.crew.0.function' }],
    });

    expect(result.recommendation).toBe('review');
    expect(result.maxSeverity).toBe('MEDIUM');
    expect(result.countsByCategory.ROLE_UNMAPPED).toBe(1);
    expect(result.causeCodes).toContain('MAPPING_ERROR');
  });

  it('interrupts the case for a critical technical-status divergence', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    draft.technicalStatus.openDiscrepancyCount = 0;

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(result.caseResult).toBe('interrupted');
    expect(result.recommendation).toBe('stop');
    expect(result.maxSeverity).toBe('CRITICAL');
    expect(result.readiness).toMatchObject({ score: 0, status: 'not_ready' });
    expect(result.countsByCategory.TECHNICAL_STATUS_MISMATCH).toBeGreaterThan(0);
    expect(result.causeCodes).toContain('TECHNICAL_STATUS_STALE');
  });

  it('compares multiple legs by sequence instead of array position', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    reference.legs.reverse();

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(result.caseResult).toBe('matched');
    expect(result.countsByCategory.LEG_MISSING).toBe(0);
    expect(result.countsByCategory.LEG_EXTRA).toBe(0);
  });

  it('detects a PIC change that was incorrectly copied between legs', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    draft.legs[1].crew[0] = structuredClone(draft.legs[0].crew[0]);

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(result.maxSeverity).toBe('HIGH');
    expect(result.recommendation).toBe('review');
    expect(result.causeCodes).toContain('IDENTITY_ERROR');
    expect(result.affectedFields.some((field) => field.startsWith('legs.2.crew.P1.'))).toBe(true);
  });

  it('classifies unit and timezone divergences with protocol cause codes', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    draft.legs[0].fuelAtEngineStart.unit = 'LB';
    draft.legs[0].timezone = 'UTC';

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(result.countsByCategory.UNIT_MISMATCH).toBe(1);
    expect(result.countsByCategory.TIMEZONE_MISMATCH).toBe(1);
    expect(result.causeCodes).toEqual(expect.arrayContaining(['UNIT_ERROR', 'TIMEZONE_ERROR']));
    expect(result.maxSeverity).toBe('HIGH');
  });

  it('stops before comparing any field when tenant scope conflicts', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    reference.tenantId = 8;

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(result).toMatchObject({
      caseResult: 'interrupted',
      recommendation: 'stop',
      maxSeverity: 'CRITICAL',
      metrics: { comparisonFieldCount: 0 },
    });
    expect(result.findings).toEqual([
      {
        category: 'TENANT_SCOPE_ERROR',
        severity: 'CRITICAL',
        causeCode: 'TENANT_SCOPE_ERROR',
        field: 'tenant_scope',
      },
    ]);
  });

  it('reports missing fields through completeness analysis without values', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    draft.volumeNumber = null;

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });

    expect(result.countsByCategory.FIELD_MISSING).toBeGreaterThan(0);
    expect(result.affectedFields).toContain('volumeNumber');
    expect(result.metrics.completenessFindingCount).toBeGreaterThan(0);
  });

  it('never returns PII, operational values, free text, or source references', () => {
    const draft = buildDraft();
    const reference = cloneDraft(draft);
    draft.legs[1].crew[0] = structuredClone(draft.legs[0].crew[0]);
    draft.legs[0].fuelAtEngineStart.value = 1;
    draft.legs[0].personsOnBoard = 1;
    draft.legs[0].payload = 1;

    const result = evaluateEdbShadowDivergence({ expectedTenantId: 7, draft, reference });
    const serialized = JSON.stringify(result);
    const scalarValues = collectScalarValues(result);

    for (const forbidden of [
      'Sensitive Operator Name',
      'Sensitive Owner Name',
      'Sensitive PIC Alpha',
      '9876543210',
      'PR-PII',
      'Sensitive occurrence free text',
      'Sensitive discrepancy free text',
      'Sensitive maintenance intervention',
      'sensitive-source-reference',
      'sensitive-flight-reference',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(scalarValues).not.toContain(98765.432);
    expect(scalarValues).not.toContain(54321.987);
    expect(scalarValues).not.toContain(73);
  });
});
