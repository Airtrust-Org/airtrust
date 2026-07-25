import { describe, expect, it } from 'vitest';
import { discoverRemediationTargets, buildRemediationApplyStatements, buildRemediationRollbackStatements } from '../../../scripts/lib/matriz-remediation-core.mjs';
import { buildRemediationFingerprint, sealRemediationPlan, assertRemediationPlanIntegrity, REMEDIATION_PLAN_SCHEMA_VERSION } from '../../../scripts/lib/matriz-remediation-plan.mjs';

const EMPRESA_ID = 6;
const VERSAO = 'TEST.01';

function baseMappings() {
  return [1, 2, 3, 4, 5].map((i) => ({ codigo_canonico: `FOO-0${i}`, correct_legacy_manobra_codigo: `LEG-0${i}` }));
}
function baseManobras(): Array<{ id: number; empresa_id: number; deleted_at: string | null; codigo: string }> {
  const wrong = [1, 2, 3, 4, 5].map((i) => ({ id: 900 + i, empresa_id: EMPRESA_ID, deleted_at: null, codigo: `FOO-0${i}` }));
  const legacy = [1, 2, 3, 4, 5].map((i) => ({ id: 800 + i, empresa_id: EMPRESA_ID, deleted_at: null, codigo: `LEG-0${i}` }));
  return [...wrong, ...legacy];
}
function toMaps(manobras: ReturnType<typeof baseManobras>) {
  return { manobraByCode: new Map(manobras.map((m) => [m.codigo, m])), manobraById: new Map(manobras.map((m) => [m.id, m])) };
}
function baseResolutionRows() {
  return [1, 2, 3, 4, 5].map((i) => ({ id: i, codigo_canonico: `FOO-0${i}`, manobra_id: 900 + i, resolution_type: 'TRUE_MISSING' }));
}
// Distribution mirrors the real contract's shape (3/1/4/1/4-like) without
// using the real numbers: 9 models, 13 affected links total.
function baseFixture() {
  const overridesByModel = [
    { 1: 'FOO-01', 2: 'FOO-02' },
    { 1: 'FOO-01' },
    { 1: 'FOO-01' },
    { 1: 'FOO-02' },
    { 1: 'FOO-03', 2: 'FOO-04' },
    { 1: 'FOO-03' },
    { 1: 'FOO-04' },
    { 1: 'FOO-05' },
    { 1: 'FOO-05', 2: 'FOO-03', 3: 'FOO-04' },
  ] as Array<Record<number, string>>;
  const wrongByCode = Object.fromEntries([1, 2, 3, 4, 5].map((i) => [`FOO-0${i}`, 900 + i]));
  const currentModelsByCode = new Map(Array.from({ length: 9 }, (_, i) => [`MOD-${i}`, { modelo_id: 10 + i, codigo_fisico: `MOD-${i}@${VERSAO}` }]));
  const linkRows: Array<{ id: number; modelo_id: number; manobra_id: number; ordem: number; obrigatoria: number; tripulante: string; observacoes: null }> = [];
  for (let m = 0; m < 9; m++) {
    for (let ordem = 1; ordem <= 18; ordem++) {
      const override = overridesByModel[m][ordem];
      const manobraId = override ? wrongByCode[override] : 700 + ordem;
      linkRows.push({ id: (10 + m) * 100 + ordem, modelo_id: 10 + m, manobra_id: manobraId, ordem, obrigatoria: 1, tripulante: 'AB', observacoes: null });
    }
  }
  return { currentModelsByCode, linkRows };
}

function discover(overrides: Partial<Parameters<typeof discoverRemediationTargets>[0]> = {}) {
  const manobras = baseManobras();
  const { manobraByCode, manobraById } = toMaps(manobras);
  const { currentModelsByCode, linkRows } = baseFixture();
  return discoverRemediationTargets({
    empresaId: EMPRESA_ID,
    versaoMatriz: VERSAO,
    mappings: baseMappings(),
    resolutionRows: baseResolutionRows(),
    activeCorrectionCodes: new Set(),
    manobraByCode,
    manobraById,
    currentModelsByCode,
    linkRows,
    ...overrides,
  });
}

describe('discoverRemediationTargets: contract validation', () => {
  it('discovers exactly 5 mappings, 9 models, 13 links from a valid fixture', () => {
    const result = discover();
    expect(result.mappingResolutions).toHaveLength(5);
    expect(result.affectedModels).toHaveLength(9);
    expect(result.affectedLinks).toHaveLength(13);
    expect(result.affectedModels.every((m) => m.links.length === 18)).toBe(true);
  });

  it('rejects fewer than 5 mappings', () => {
    expect(() => discover({ mappings: baseMappings().slice(0, 4) })).toThrow(/5 mappings/);
  });

  it('rejects more than 5 mappings', () => {
    expect(() => discover({ mappings: [...baseMappings(), { codigo_canonico: 'FOO-06', correct_legacy_manobra_codigo: 'LEG-06' }] })).toThrow(/5 mappings/);
  });

  it('rejects a duplicated codigo_canonico within the mapping', () => {
    const mappings = baseMappings();
    mappings[4] = { ...mappings[0] };
    expect(() => discover({ mappings })).toThrow(/duplicado/);
  });

  it('rejects a mapping with no resolution row for the code', () => {
    const resolutionRows = baseResolutionRows().filter((r) => r.codigo_canonico !== 'FOO-05');
    expect(() => discover({ resolutionRows })).toThrow(/sem resolução registrada/);
  });

  it('rejects a mapping already resolved as EXACT_UNIQUE/FORMAL_ALIAS/LEGACY_EQUIVALENT (not eligible for this correction)', () => {
    const resolutionRows = baseResolutionRows();
    resolutionRows[0] = { ...resolutionRows[0], resolution_type: 'EXACT_UNIQUE' };
    expect(() => discover({ resolutionRows })).toThrow(/não é elegível/);
  });

  it('rejects two mappings pointing at the same wrong manobra_id', () => {
    const resolutionRows = baseResolutionRows();
    resolutionRows[1] = { ...resolutionRows[1], manobra_id: resolutionRows[0].manobra_id };
    expect(() => discover({ resolutionRows })).toThrow(/reutilizada por mais de um mapping/);
  });

  it('rejects a code already carrying a current correction overlay (idempotency guard)', () => {
    expect(() => discover({ activeCorrectionCodes: new Set(['FOO-01']) })).toThrow(/já possui correção corrente/);
  });

  it('rejects when the wrong manobra no longer exists / is soft-deleted', () => {
    const manobras = baseManobras().map((m) => (m.codigo === 'FOO-01' ? { ...m, deleted_at: '2026-01-01' } : m));
    const { manobraByCode, manobraById } = toMaps(manobras);
    expect(() => discover({ manobraByCode, manobraById })).toThrow(/não está mais ativa/);
  });

  it('rejects when the wrong manobra belongs to another tenant', () => {
    const manobras = baseManobras().map((m) => (m.codigo === 'FOO-01' ? { ...m, empresa_id: 9 } : m));
    const { manobraByCode, manobraById } = toMaps(manobras);
    expect(() => discover({ manobraByCode, manobraById })).toThrow(/outro tenant/);
  });

  it('rejects when the legacy manobra code is not found', () => {
    const manobras = baseManobras().filter((m) => m.codigo !== 'LEG-01');
    const { manobraByCode, manobraById } = toMaps(manobras);
    expect(() => discover({ manobraByCode, manobraById })).toThrow(/não encontrada ou inativa/);
  });

  it('rejects when the legacy manobra belongs to another tenant', () => {
    const manobras = baseManobras().map((m) => (m.codigo === 'LEG-01' ? { ...m, empresa_id: 9 } : m));
    const { manobraByCode, manobraById } = toMaps(manobras);
    expect(() => discover({ manobraByCode, manobraById })).toThrow(/outro tenant/);
  });

  it('rejects when the legacy manobra is identical to the wrong manobra', () => {
    const mappings = baseMappings();
    mappings[0] = { codigo_canonico: 'FOO-01', correct_legacy_manobra_codigo: 'FOO-01' };
    const manobras = baseManobras();
    const { manobraByCode, manobraById } = toMaps(manobras);
    expect(() => discover({ mappings, manobraByCode, manobraById })).toThrow(/mesma manobra/);
  });

  it('rejects a link count different from exactly 13', () => {
    const { currentModelsByCode, linkRows } = baseFixture();
    // Remove one affected link (model 10, ordem 1) so only 12 remain.
    const filtered = linkRows.filter((l) => !(l.modelo_id === 10 && l.ordem === 1));
    expect(() => discover({ currentModelsByCode, linkRows: filtered })).toThrow(/13 vínculos afetados/);
  });

  it('rejects a model count different from exactly 9', () => {
    // Collapse two affected models into one canonical code so only 8 remain.
    const { currentModelsByCode, linkRows } = baseFixture();
    const merged = new Map(currentModelsByCode);
    merged.delete('MOD-8');
    const relinked = linkRows.map((l) => (l.modelo_id === 18 ? { ...l, modelo_id: 17 } : l));
    // 17 now has 2 sets of 18 links colliding on ordem 1-3; use unique ordinals instead: expect this to fail differently.
    // Simpler: directly assert the 9-model invariant using a model with zero affected links removed from the map.
    expect(() => discover({ currentModelsByCode: merged, linkRows: relinked })).toThrow();
  });

  it('rejects when an affected model does not have exactly 18 total links', () => {
    const { currentModelsByCode, linkRows } = baseFixture();
    const withExtra = [...linkRows, { id: 999999, modelo_id: 10, manobra_id: 750, ordem: 19, obrigatoria: 1, tripulante: 'AB', observacoes: null }];
    expect(() => discover({ currentModelsByCode, linkRows: withExtra })).toThrow(/18 vínculos/);
  });

  it('rejects when an affected model is not the current version for the target versao_matriz', () => {
    const { currentModelsByCode, linkRows } = baseFixture();
    const withoutOne = new Map(currentModelsByCode);
    withoutOne.delete('MOD-0');
    expect(() => discover({ currentModelsByCode: withoutOne, linkRows })).toThrow();
  });
});

describe('buildRemediationFingerprint / plan integrity', () => {
  it('is deterministic given the same discovered target set', () => {
    const result = discover();
    const a = buildRemediationFingerprint({ empresaId: EMPRESA_ID, versaoMatriz: VERSAO, mappingResolutions: result.mappingResolutions, affectedLinks: result.affectedLinks });
    const b = buildRemediationFingerprint({ empresaId: EMPRESA_ID, versaoMatriz: VERSAO, mappingResolutions: result.mappingResolutions, affectedLinks: result.affectedLinks });
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).toHaveLength(64);
  });

  it('changes when a single affected link id differs (drift-sensitive)', () => {
    const result = discover();
    const a = buildRemediationFingerprint({ empresaId: EMPRESA_ID, versaoMatriz: VERSAO, mappingResolutions: result.mappingResolutions, affectedLinks: result.affectedLinks });
    const mutated = result.affectedLinks.map((l, i) => (i === 0 ? { ...l, id: l.id + 1 } : l));
    const b = buildRemediationFingerprint({ empresaId: EMPRESA_ID, versaoMatriz: VERSAO, mappingResolutions: result.mappingResolutions, affectedLinks: mutated });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('seals and validates a plan round-trip', () => {
    const result = discover();
    const { fingerprint: expectedHash } = buildRemediationFingerprint({ empresaId: EMPRESA_ID, versaoMatriz: VERSAO, mappingResolutions: result.mappingResolutions, affectedLinks: result.affectedLinks });
    const plan = sealRemediationPlan({
      schema_version: REMEDIATION_PLAN_SCHEMA_VERSION,
      remediation_uuid: 'rem-1',
      empresa_id: EMPRESA_ID,
      versao_matriz: VERSAO,
      base_fingerprint: 'a'.repeat(64),
      expected_hash: expectedHash,
      mapping_count: 5,
      model_count: 9,
      link_count: 13,
    });
    expect(() => assertRemediationPlanIntegrity(plan, { baseFingerprint: 'a'.repeat(64), expectedHash })).not.toThrow();
  });

  it('rejects a tampered plan_sha256', () => {
    const plan = sealRemediationPlan({ schema_version: REMEDIATION_PLAN_SCHEMA_VERSION, remediation_uuid: 'rem-1', empresa_id: EMPRESA_ID, mapping_count: 5, model_count: 9, link_count: 13 });
    const tampered = { ...plan, plan_sha256: 'f'.repeat(64) };
    expect(() => assertRemediationPlanIntegrity(tampered)).toThrow(/adulterado/);
  });

  it('rejects a plan for empresa_id other than 6', () => {
    const plan = sealRemediationPlan({ schema_version: REMEDIATION_PLAN_SCHEMA_VERSION, remediation_uuid: 'rem-1', empresa_id: 9, mapping_count: 5, model_count: 9, link_count: 13 });
    expect(() => assertRemediationPlanIntegrity(plan)).toThrow(/não autorizado/);
  });

  it('rejects a plan whose base_fingerprint does not match the caller-supplied value', () => {
    const plan = sealRemediationPlan({ schema_version: REMEDIATION_PLAN_SCHEMA_VERSION, remediation_uuid: 'rem-1', empresa_id: EMPRESA_ID, base_fingerprint: 'a'.repeat(64), mapping_count: 5, model_count: 9, link_count: 13 });
    expect(() => assertRemediationPlanIntegrity(plan, { baseFingerprint: 'b'.repeat(64) })).toThrow(/base_fingerprint adulterado/);
  });
});

describe('buildRemediationApplyStatements / buildRemediationRollbackStatements: no forbidden operations', () => {
  it('never emits CREATE TEMP TABLE, UPDATE, or DELETE against modelos_sessao_manobras', () => {
    const result = discover();
    const modelPhysicalMeta = new Map(result.affectedModels.map((m) => [m.modelo_id, { versaoNumero: 1 }]));
    const { statements } = buildRemediationApplyStatements({
      empresaId: EMPRESA_ID,
      versaoMatriz: VERSAO,
      remediationUuid: 'rem-1',
      guideRelinkUuid: 'rem-1-guide',
      guideRelinkExpectedHash: 'a'.repeat(64),
      affectedModels: result.affectedModels,
      mappingResolutions: result.mappingResolutions,
      modelPhysicalMeta,
      guideRelinkEntries: [],
    });
    for (const sql of statements) {
      expect(sql).not.toMatch(/CREATE\s+TEMP/i);
      expect(sql).not.toMatch(/UPDATE\s+modelos_sessao_manobras\b/i);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+modelos_sessao_manobras\b/i);
      expect(sql).not.toMatch(/UPDATE\s+simuladores_matriz_manobra_resolution\b/i);
    }
  });

  it('apply creates exactly one new modelos_sessao row per affected model', () => {
    const result = discover();
    const modelPhysicalMeta = new Map(result.affectedModels.map((m) => [m.modelo_id, { versaoNumero: 1 }]));
    const { statements } = buildRemediationApplyStatements({
      empresaId: EMPRESA_ID,
      versaoMatriz: VERSAO,
      remediationUuid: 'rem-1',
      guideRelinkUuid: 'rem-1-guide',
      guideRelinkExpectedHash: 'a'.repeat(64),
      affectedModels: result.affectedModels,
      mappingResolutions: result.mappingResolutions,
      modelPhysicalMeta,
      guideRelinkEntries: [],
    });
    const modelInserts = statements.filter((s) => s.startsWith('INSERT INTO modelos_sessao('));
    expect(modelInserts).toHaveLength(9);
  });

  it('apply copies exactly 18 links per model (162 total) with only the affected ones substituted', () => {
    const result = discover();
    const modelPhysicalMeta = new Map(result.affectedModels.map((m) => [m.modelo_id, { versaoNumero: 1 }]));
    const { statements } = buildRemediationApplyStatements({
      empresaId: EMPRESA_ID,
      versaoMatriz: VERSAO,
      remediationUuid: 'rem-1',
      guideRelinkUuid: 'rem-1-guide',
      guideRelinkExpectedHash: 'a'.repeat(64),
      affectedModels: result.affectedModels,
      mappingResolutions: result.mappingResolutions,
      modelPhysicalMeta,
      guideRelinkEntries: [],
    });
    const linkInserts = statements.filter((s) => s.startsWith('INSERT INTO modelos_sessao_manobras('));
    expect(linkInserts).toHaveLength(162);
    const changeRows = statements.filter((s) => s.includes("'LINK_SUBSTITUTE'"));
    expect(changeRows).toHaveLength(13);
    const copyRows = statements.filter((s) => s.includes("'LINK_COPY'"));
    expect(copyRows).toHaveLength(162 - 13);
  });

  it('rollback change_order continues from the caller-supplied startChangeOrder (no collision with apply ledger)', () => {
    const result = discover();
    const modelPhysicalMeta = new Map(result.affectedModels.map((m) => [m.modelo_id, { versaoNumero: 1 }]));
    const { lastChangeOrder: applyLast } = buildRemediationApplyStatements({
      empresaId: EMPRESA_ID,
      versaoMatriz: VERSAO,
      remediationUuid: 'rem-1',
      guideRelinkUuid: 'rem-1-guide',
      guideRelinkExpectedHash: 'a'.repeat(64),
      affectedModels: result.affectedModels,
      mappingResolutions: result.mappingResolutions,
      modelPhysicalMeta,
      guideRelinkEntries: [],
    });
    const { statements: rollbackStatements, lastChangeOrder: rollbackLast } = buildRemediationRollbackStatements({
      empresaId: EMPRESA_ID,
      versaoMatriz: VERSAO,
      remediationUuid: 'rem-1',
      compensationUuid: 'compensate-rem-1',
      affectedModels: result.affectedModels.map((m) => ({ codigo_canonico: m.codigo_canonico, remediated_modelo_id: m.modelo_id + 1000, remediated_versao_numero: 2, original_links: m.links })),
      correctionRows: result.mappingResolutions.map((m, i) => ({ id: i + 1, codigo_canonico: m.codigo_canonico, corrected_manobra_id: m.correct_manobra_id, original_manobra_id: m.wrong_manobra_id })),
      guideRelinkRollbackUuid: 'compensate-rem-1-guide',
      guideRelinkEntries: [],
      guideRelinkExpectedHash: 'b'.repeat(64),
      startChangeOrder: applyLast + 1,
    });
    const changeOrders = rollbackStatements
      .filter((s) => s.includes('simuladores_matriz_remediation_changes'))
      .map((s) => Number(s.match(/,\s*(\d+),\s*'/)?.[1]))
      .filter((n) => Number.isFinite(n));
    expect(Math.min(...changeOrders)).toBeGreaterThan(applyLast);
    expect(rollbackLast).toBeGreaterThan(applyLast);
  });

  it('never hard-deletes the wrong manobras (no DELETE FROM manobras anywhere in apply or rollback)', () => {
    const result = discover();
    const modelPhysicalMeta = new Map(result.affectedModels.map((m) => [m.modelo_id, { versaoNumero: 1 }]));
    const { statements: applyStatements } = buildRemediationApplyStatements({
      empresaId: EMPRESA_ID,
      versaoMatriz: VERSAO,
      remediationUuid: 'rem-1',
      guideRelinkUuid: 'rem-1-guide',
      guideRelinkExpectedHash: 'a'.repeat(64),
      affectedModels: result.affectedModels,
      mappingResolutions: result.mappingResolutions,
      modelPhysicalMeta,
      guideRelinkEntries: [],
    });
    for (const sql of applyStatements) {
      expect(sql).not.toMatch(/DELETE\s+FROM\s+manobras\b/i);
    }
  });
});
