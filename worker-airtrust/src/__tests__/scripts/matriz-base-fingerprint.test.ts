import { describe, expect, it } from 'vitest';
import {
  assertRealTenantFingerprintState,
  buildTenantFingerprint,
} from '../../../scripts/lib/matriz-base-fingerprint.mjs';
import {
  createDeterministicPlan,
  assertPlanIntegrity,
  sealPlan,
  sha256,
} from '../../../scripts/lib/matriz-import-plan.mjs';
import {
  EXPECTED_MANOEUVRE_CODE_COUNT,
  buildManoeuvreResolutionEntries,
} from '../../../scripts/lib/matriz-manobra-resolution.mjs';

function hashes(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`file-${index}`, sha256(`content-${index}`)]),
  );
}

const item = (modelo: string, ordem: number, codigo: string) => ({
  modelo,
  ordem,
  codigo,
  nome: `N-${codigo}`,
  execucao_pf: 'A',
  categoria: 'PROCEDIMENTO',
  fase_voo: 'SOLO',
  tipo_conteudo: 'NORMAL',
  cenario: null,
  configuracao_ios: null,
  desempenho_esperado: 'ok',
  foco_instrutor: 'ok',
  como_observar: 'ok',
  referencia_tecnica: 'ok',
  rastreabilidade_interna: null,
  criterios: { '1-2': 'a', '3-5': 'b', '6-8': 'c', '9-10': 'd' },
});

// Cycles through exactly EXPECTED_MANOEUVRE_CODE_COUNT distinct manoeuvre
// codes across all model positions, mirroring the real matrices (918
// item-positions resolving to 301 distinct canonical codes).
function matrix(prefix: string, n: number) {
  const aeronave = (prefix.startsWith('A') ? 'AW139' : 'SK76') as 'AW139' | 'SK76';
  const models = Array.from({ length: n }, (_, index) => ({
    codigo: `${prefix}-${index + 1}`,
    programa: 'Inicial',
    ciclo: null,
    titulo: `T${index + 1}`,
    aeronave,
  }));
  let globalOrder = 0;
  const items = models.flatMap((model) =>
    Array.from({ length: 18 }, (_, order) => {
      const codigo = `C-${(globalOrder % EXPECTED_MANOEUVRE_CODE_COUNT) + 1}`;
      globalOrder += 1;
      return item(model.codigo, order + 1, codigo);
    }),
  );
  return { models, items };
}

function resolutionFor(...matrices: Array<{ items: ReturnType<typeof item>[] }>) {
  return buildManoeuvreResolutionEntries({
    empresaId: 7,
    items: matrices.flatMap((m) => m.items),
    tenantManobras: [],
  });
}

describe('matriz fingerprint and plan integrity', () => {
  it('changes fingerprint when any tenant/version/link/migration field is tampered', () => {
    const base = buildTenantFingerprint({
      empresaId: 7,
      currentVersions: [
        {
          codigo_canonico: 'A139-I-01/12',
          modelo_id: 10,
          versao_numero: 1,
          versao_matriz: 'LEGACY',
          is_current: 1,
        },
      ],
      resolvedManoeuvres: [{ id: 1, codigo: 'A139-CHK-01', empresa_id: 7 }],
      links: [{ id: 1, modelo_id: 10, manobra_id: 1, ordem: 1, deleted_at: null }],
      migrationState: { has_0440: true, versionamento_count: 1 },
    });
    const tampered = buildTenantFingerprint({
      empresaId: 7,
      currentVersions: [
        {
          codigo_canonico: 'A139-I-01/12',
          modelo_id: 11,
          versao_numero: 1,
          versao_matriz: 'LEGACY',
          is_current: 1,
        },
      ],
      resolvedManoeuvres: [{ id: 1, codigo: 'A139-CHK-01', empresa_id: 7 }],
      links: [{ id: 1, modelo_id: 10, manobra_id: 1, ordem: 1, deleted_at: null }],
      migrationState: { has_0440: true, versionamento_count: 1 },
    });
    expect(base.fingerprint).not.toBe(tampered.fingerprint);
  });

  it('requires 61 hashes and 51/918/22 and detects plan/hash tampering', () => {
    const aw = matrix('A139', 30);
    const sk = matrix('SK76', 21);
    const sourceHashes = hashes(61);
    const plan = createDeterministicPlan({
      empresaId: 7,
      sourceHashes,
      aw139: aw,
      sk76: sk,
      loft: 22,
      baseFingerprint: 'b'.repeat(64),
      contract: { schema_version: 1, totals: { modelos: 51, vinculos: 918, loft: 22 } },
      loftSummary: { verdict: '22/22' },
      manobraResolution: resolutionFor(aw, sk),
    });
    expect(plan.plan_sha256).toHaveLength(64);
    expect(() => assertPlanIntegrity(plan)).not.toThrow();
    expect(() => assertPlanIntegrity({ ...plan, plan_sha256: 'c'.repeat(64) })).toThrow(
      /adulterado/,
    );
    expect(() =>
      assertPlanIntegrity(plan, { sourceHashes: { ...sourceHashes, 'file-0': 'd'.repeat(64) } }),
    ).toThrow(/fonte adulterado/);
    expect(() =>
      createDeterministicPlan({
        empresaId: 7,
        sourceHashes: hashes(60),
        aw139: aw,
        sk76: sk,
        loft: 22,
        manobraResolution: [],
      }),
    ).toThrow(/61/);
  });

  it('refuses a fabricated empty production snapshot', () => {
    expect(() =>
      assertRealTenantFingerprintState({
        empresaId: 7,
        currentVersions: [],
        resolvedManoeuvres: [],
        links: [],
        migrationState: { has_0440: false },
      }),
    ).toThrow(/versões correntes/);
    expect(() =>
      assertRealTenantFingerprintState({
        empresaId: 7,
        currentVersions: [{ codigo_canonico: 'A139-I-01/12' }],
        resolvedManoeuvres: [{ id: 1 }],
        links: [{ id: 1 }],
        migrationState: {},
      }),
    ).toThrow(/estado real/);
    expect(() =>
      assertRealTenantFingerprintState({
        empresaId: 7,
        currentVersions: [{ codigo_canonico: 'A139-I-01/12' }],
        resolvedManoeuvres: [{ id: 1 }],
        links: [{ id: 1 }],
        migrationState: { has_0440: true },
      }),
    ).not.toThrow();
  });

  it('seals the complete plan canonically and rejects every sealed-field mutation', () => {
    const aw139 = matrix('A139', 30);
    const sk76 = matrix('SK76', 21);
    const base = createDeterministicPlan({
      empresaId: 7,
      sourceHashes: hashes(61),
      aw139,
      sk76,
      loft: 22,
      baseFingerprint: 'b'.repeat(64),
      manobraResolution: resolutionFor(aw139, sk76),
    });
    const { plan_sha256: _hash, ...body } = base;
    const plan = sealPlan({ ...body, generated_at: '2026-07-22T00:00:00.000Z', mode: 'DRY_RUN', contract_validation: { ok: true } });
    expect(() => assertPlanIntegrity(JSON.parse(JSON.stringify(plan)))).not.toThrow();
    for (const mutation of [
      { generated_at: '2026-07-23T00:00:00.000Z' }, { mode: 'APPLY' },
      { contract_validation: { ok: false } }, { safeguards: ['alterado'] },
      { source_hashes: { changed: 'x' } }, { base_fingerprint: 'c'.repeat(64) },
      { totals: { modelos: 50, vinculos: 918, loft: 22 } },
      { matrices: { ...plan.matrices, AW139: { ...plan.matrices.AW139, models: [] } } },
    ]) expect(() => assertPlanIntegrity({ ...plan, ...mutation })).toThrow(/adulterado/);
    const { mode: _mode, ...missing } = plan;
    expect(() => assertPlanIntegrity(missing)).toThrow(/adulterado/);
    expect(() => assertPlanIntegrity({ ...plan, plan_sha256: undefined })).toThrow(/ausente/);
    expect(sealPlan(body).plan_sha256).toBe(sealPlan({ ...body }).plan_sha256);
  });
});
