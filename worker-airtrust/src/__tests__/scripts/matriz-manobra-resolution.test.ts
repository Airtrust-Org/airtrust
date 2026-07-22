import { describe, expect, it } from 'vitest';
import {
  EXPECTED_MANOEUVRE_CODE_COUNT,
  buildManoeuvreResolutionEntries,
  classifyManoeuvreCode,
  physicalManoeuvreCode,
  validateManoeuvreResolution,
} from '../../../scripts/lib/matriz-manobra-resolution.mjs';

// The 23 real canonical codes confirmed absent by exact-code match, tenant-
// wide and cross-tenant, during the 2026-07-22 reconciliation of the
// AW139/S-76 matrix import. Only the technical code and its verified
// classification are versioned here, per the sanitization rule: no names,
// categories, or operational descriptions. A second, semantic re-audit
// (name/aeronave/categoria domain/descrição/vínculos históricos, exercised
// against real production data in matriz-apply-rollback.test.ts) further
// reclassified 5 of these 23 as LEGACY_EQUIVALENT of pre-existing manobras
// under legacy naming; the classifier itself — exercised here in isolation,
// with no tenant catalog supplied — correctly falls back to TRUE_MISSING for
// all 23 absent that external evidence, which is exactly what it must do
// without a human-reviewed override.
const REAL_23_CODES_ABSENT_BY_EXACT_CODE = [
  'ABN-ANO-69',
  'ABN-HNG-69',
  'ABN-MRC-30B',
  'ABN-NLO-69',
  'ABN-RTR-43',
  'ABN-STA-28',
  'ABN-STD-69',
  'ABN-TCS-30D',
  'ABN-TDR-30C',
  'ABN-TRC-30E',
  'CAU-FDT-62',
  'CAU-FPC-73',
  'CAU-GNH-53',
  'CAU-GNO-54',
  'CAU-MCC-104',
  'MSG-ADS-97',
  'MSG-ATF-89',
  'MSG-CAS-91',
  'MSG-FDF-98',
  'MSG-HDF-89',
  'WAR-CAB-24',
  'WAR-EEC-18E',
  'WAR-TMP-30A',
];
// Final, real-data-confirmed classification: 5 semantic legacy equivalents.
const REAL_5_LEGACY_EQUIVALENT_CODES = ['ABN-STA-28', 'WAR-TMP-30A', 'ABN-MRC-30B', 'ABN-TDR-30C', 'ABN-TCS-30D'];
// Final, real-data-confirmed classification: 18 genuinely missing codes.
const REAL_18_TRUE_MISSING_CODES = REAL_23_CODES_ABSENT_BY_EXACT_CODE.filter(
  (code) => !REAL_5_LEGACY_EQUIVALENT_CODES.includes(code),
);

function item(codigo: string, modelo: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    modelo,
    codigo,
    nome: `nome-${codigo}`,
    categoria: `categoria-${codigo}`,
    aeronave: 'AW139',
    fase_voo: 'VOO',
    tipo_conteudo: 'ABNORMAL',
    referencia_tecnica: null,
    desempenho_esperado: null,
    ...overrides,
  };
}

function fullFixtureItems(missingCodes: string[]) {
  // 278 exact-unique codes + the given (real) missing codes = 301 total.
  const exact = Array.from({ length: EXPECTED_MANOEUVRE_CODE_COUNT - missingCodes.length }, (_, i) =>
    item(`EX-${i + 1}`, 'MODEL-A'),
  );
  const missing = missingCodes.map((codigo) => item(codigo, 'MODEL-B'));
  return [...exact, ...missing];
}

function tenantManobrasFor(items: ReturnType<typeof item>[], empresaId: number) {
  return items
    .filter((i) => i.codigo.startsWith('EX-'))
    .map((i, index) => ({ id: 1000 + index, codigo: i.codigo, empresa_id: empresaId, deleted_at: null }));
}

describe('matriz-manobra-resolution: classification', () => {
  it('classifies an exact unique tenant match', () => {
    const tenantManobras = [{ id: 1, codigo: 'A-1', empresa_id: 6, deleted_at: null }];
    const result = classifyManoeuvreCode({
      codigoCanonico: 'A-1',
      empresaId: 6,
      tenantManobras,
    });
    expect(result).toEqual({ resolution_type: 'EXACT_UNIQUE', existing_manobra_id: 1 });
  });

  it('classifies a collision when two active tenant rows share the code', () => {
    const tenantManobras = [
      { id: 1, codigo: 'A-1', empresa_id: 6, deleted_at: null },
      { id: 2, codigo: 'A-1', empresa_id: 6, deleted_at: null },
    ];
    const result = classifyManoeuvreCode({ codigoCanonico: 'A-1', empresaId: 6, tenantManobras });
    expect(result.resolution_type).toBe('COLLISION');
    expect(result.candidates).toHaveLength(2);
  });

  it('classifies cross-tenant-only when the code exists solely in another tenant', () => {
    const tenantManobras: unknown[] = [];
    const allManobras = [{ id: 9, codigo: 'A-1', empresa_id: 7, deleted_at: null }];
    const result = classifyManoeuvreCode({
      codigoCanonico: 'A-1',
      empresaId: 6,
      tenantManobras,
      allManobras,
    });
    expect(result.resolution_type).toBe('CROSS_TENANT_ONLY');
  });

  it('classifies the real 23 codes as TRUE_MISSING (verified absent tenant-wide and cross-tenant)', () => {
    for (const codigo of REAL_23_CODES_ABSENT_BY_EXACT_CODE) {
      const result = classifyManoeuvreCode({
        codigoCanonico: codigo,
        empresaId: 6,
        tenantManobras: [],
        allManobras: [],
      });
      expect(result).toEqual({ resolution_type: 'TRUE_MISSING' });
    }
  });

  it('ignores soft-deleted rows for both exact and collision detection', () => {
    const tenantManobras = [{ id: 1, codigo: 'A-1', empresa_id: 6, deleted_at: '2026-01-01' }];
    const result = classifyManoeuvreCode({ codigoCanonico: 'A-1', empresaId: 6, tenantManobras });
    expect(result.resolution_type).toBe('TRUE_MISSING');
  });
});

describe('matriz-manobra-resolution: building + validating the 301-entry block', () => {
  it('builds and validates exactly 301 resolutions: 278 EXACT_UNIQUE + the real 23 TRUE_MISSING', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });

    expect(entries).toHaveLength(EXPECTED_MANOEUVRE_CODE_COUNT);
    const byType = new Map<string, number>();
    for (const entry of entries) byType.set(entry.resolution_type, (byType.get(entry.resolution_type) || 0) + 1);
    expect(byType.get('EXACT_UNIQUE')).toBe(278);
    expect(byType.get('TRUE_MISSING')).toBe(23);

    const requestedCodes = [...new Set(items.map((i) => i.codigo))];
    expect(() => validateManoeuvreResolution(entries, { requestedCodes })).not.toThrow();

    for (const codigo of REAL_23_CODES_ABSENT_BY_EXACT_CODE) {
      const entry = entries.find((e) => e.codigo_canonico === codigo);
      expect(entry?.resolution_type).toBe('TRUE_MISSING');
      expect(entry?.existing_manobra_id).toBeNull();
      expect(entry?.create_payload).toMatchObject({ codigo, nome: `nome-${codigo}` });
    }
  });

  it('builds and validates the final real classification: 278 EXACT_UNIQUE + 5 LEGACY_EQUIVALENT + 18 TRUE_MISSING', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const overrides = Object.fromEntries(
      REAL_5_LEGACY_EQUIVALENT_CODES.map((codigo, i) => [
        codigo,
        { resolution_type: 'LEGACY_EQUIVALENT', existing_manobra_id: 9000 + i, evidence: { nome_normalizado: true, aeronave: true } },
      ]),
    );
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras, overrides });

    expect(entries).toHaveLength(EXPECTED_MANOEUVRE_CODE_COUNT);
    const byType = new Map<string, number>();
    for (const entry of entries) byType.set(entry.resolution_type, (byType.get(entry.resolution_type) || 0) + 1);
    expect(byType.get('EXACT_UNIQUE')).toBe(278);
    expect(byType.get('LEGACY_EQUIVALENT')).toBe(5);
    expect(byType.get('TRUE_MISSING')).toBe(18);
    expect((byType.get('EXACT_UNIQUE') ?? 0) + (byType.get('LEGACY_EQUIVALENT') ?? 0) + (byType.get('TRUE_MISSING') ?? 0)).toBe(
      EXPECTED_MANOEUVRE_CODE_COUNT,
    );

    const requestedCodes = [...new Set(items.map((i) => i.codigo))];
    expect(() => validateManoeuvreResolution(entries, { requestedCodes })).not.toThrow();

    for (const codigo of REAL_18_TRUE_MISSING_CODES) {
      expect(entries.find((e) => e.codigo_canonico === codigo)?.resolution_type).toBe('TRUE_MISSING');
    }
    for (const codigo of REAL_5_LEGACY_EQUIVALENT_CODES) {
      const entry = entries.find((e) => e.codigo_canonico === codigo);
      expect(entry?.resolution_type).toBe('LEGACY_EQUIVALENT');
      expect(entry?.existing_manobra_id).not.toBeNull();
    }
  });

  it('rejects a block with fewer than 301 resolutions', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras }).slice(0, 300);
    expect(() => validateManoeuvreResolution(entries, { requestedCodes: [] })).toThrow(/301/);
  });

  it('rejects a block with more than 301 resolutions', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    const withDupe = [...entries, { ...entries[0], codigo_canonico: 'EXTRA-CODE' }];
    expect(() => validateManoeuvreResolution(withDupe, { requestedCodes: [] })).toThrow(/301/);
  });

  it('rejects a duplicated canonical code in the resolution block', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    const mutated = [...entries.slice(0, 300), { ...entries[300], codigo_canonico: entries[0].codigo_canonico }];
    expect(() => validateManoeuvreResolution(mutated, { requestedCodes: [] })).toThrow(/duplicado/);
  });

  it('rejects a requested code missing from the resolution block', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    expect(() =>
      validateManoeuvreResolution(entries, { requestedCodes: [...items.map((i) => i.codigo), 'GHOST-CODE'] }),
    ).toThrow(/sem resolução/);
  });

  it('rejects two canonical codes resolving to the same existing manobra_id', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    const exactEntries = entries.filter((e) => e.resolution_type === 'EXACT_UNIQUE');
    const mutated = entries.map((e) =>
      e.codigo_canonico === exactEntries[1].codigo_canonico
        ? { ...e, existing_manobra_id: exactEntries[0].existing_manobra_id }
        : e,
    );
    expect(() => validateManoeuvreResolution(mutated, { requestedCodes: [] })).toThrow(/reutilizada/);
  });

  it('rejects an incomplete create_payload for a TRUE_MISSING/COLLISION/CROSS_TENANT_ONLY entry', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    const mutated = entries.map((e) =>
      e.resolution_type === 'TRUE_MISSING' && e.codigo_canonico === REAL_23_CODES_ABSENT_BY_EXACT_CODE[0]
        ? { ...e, create_payload: { codigo: e.codigo_canonico } }
        : e,
    );
    expect(() => validateManoeuvreResolution(mutated, { requestedCodes: [] })).toThrow(/create_payload/);
  });

  it('rejects an EXACT_UNIQUE/FORMAL_ALIAS/LEGACY_EQUIVALENT entry without existing_manobra_id', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    const mutated = entries.map((e) =>
      e.resolution_type === 'EXACT_UNIQUE' ? { ...e, existing_manobra_id: null } : e,
    );
    expect(() => validateManoeuvreResolution(mutated, { requestedCodes: [] })).toThrow(/existing_manobra_id/);
  });

  it('rejects an unknown resolution_type', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE);
    const tenantManobras = tenantManobrasFor(items, 6);
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras });
    const mutated = entries.map((e, i) => (i === 0 ? { ...e, resolution_type: 'GUESS' } : e));
    expect(() => validateManoeuvreResolution(mutated, { requestedCodes: [] })).toThrow(/resolution_type inválido/);
  });

  it('accepts a human-reviewed FORMAL_ALIAS/LEGACY_EQUIVALENT override with evidence', () => {
    const items = fullFixtureItems(REAL_23_CODES_ABSENT_BY_EXACT_CODE.slice(0, 1));
    const tenantManobras = tenantManobrasFor(items, 6);
    const legacyId = 555;
    const overrides = {
      [REAL_23_CODES_ABSENT_BY_EXACT_CODE[0]]: {
        resolution_type: 'LEGACY_EQUIVALENT',
        existing_manobra_id: legacyId,
        evidence: { nome_normalizado: true, categoria: true },
      },
    };
    const entries = buildManoeuvreResolutionEntries({ empresaId: 6, items, tenantManobras, overrides });
    const entry = entries.find((e) => e.codigo_canonico === REAL_23_CODES_ABSENT_BY_EXACT_CODE[0]);
    expect(entry?.resolution_type).toBe('LEGACY_EQUIVALENT');
    expect(entry?.existing_manobra_id).toBe(legacyId);
    expect(entry?.evidence_hash).toBeTruthy();
  });
});

describe('physicalManoeuvreCode', () => {
  it('builds a deterministic versioned physical code', () => {
    expect(physicalManoeuvreCode('WAR-EEC-18E', 'M2026.07')).toBe('WAR-EEC-18E@M2026.07');
  });
});
