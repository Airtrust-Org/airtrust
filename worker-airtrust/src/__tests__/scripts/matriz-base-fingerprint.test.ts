import { describe, expect, it } from 'vitest';
import { buildTenantFingerprint } from '../../../scripts/lib/matriz-base-fingerprint.mjs';
import {
  createDeterministicPlan,
  assertPlanIntegrity,
  sha256,
} from '../../../scripts/lib/matriz-import-plan.mjs';

function hashes(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`file-${index}`, sha256(`content-${index}`)]),
  );
}

const item = (modelo: string, ordem: number) => ({
  modelo,
  ordem,
  codigo: `C-${ordem}`,
  nome: `N-${ordem}`,
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

function matrix(prefix: string, n: number) {
  const aeronave = (prefix.startsWith('A') ? 'AW139' : 'SK76') as 'AW139' | 'SK76';
  const models = Array.from({ length: n }, (_, index) => ({
    codigo: `${prefix}-${index + 1}`,
    programa: 'Inicial',
    ciclo: null,
    titulo: `T${index + 1}`,
    aeronave,
  }));
  const items = models.flatMap((model) =>
    Array.from({ length: 18 }, (_, order) => item(model.codigo, order + 1)),
  );
  return { models, items };
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
      }),
    ).toThrow(/61/);
  });
});
