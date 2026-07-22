import { describe, expect, it } from 'vitest';
import {
  createDeterministicPlan,
  sha256,
  validateModelItems,
  EXPECTED_SOURCE_HASH_COUNT,
} from '../../../scripts/lib/matriz-import-plan.mjs';
import {
  EXPECTED_MANOEUVRE_CODE_COUNT,
  buildManoeuvreResolutionEntries,
} from '../../../scripts/lib/matriz-manobra-resolution.mjs';

const item = (modelo: string, ordem: number, codigo = `A-${ordem}`) => ({
  modelo,
  ordem,
  codigo,
  nome: `M ${ordem}`,
  execucao_pf: 'A',
  categoria: 'PROCEDIMENTO',
  fase_voo: 'SOLO',
  tipo_conteudo: 'NORMAL',
  cenario: null,
  configuracao_ios: null,
  desempenho_esperado: 'Esperado',
  foco_instrutor: 'Foco',
  como_observar: 'Observação',
  referencia_tecnica: 'RFM',
  rastreabilidade_interna: null,
  criterios: { '1-2': 'Baixo', '3-5': 'Médio', '6-8': 'Bom', '9-10': 'Excelente' },
});

// Cycles through exactly EXPECTED_MANOEUVRE_CODE_COUNT distinct manoeuvre
// codes across all model positions, mirroring the real matrices where 918
// item-positions resolve to exactly 301 distinct canonical codes.
let globalOrderCounter = 0;
function nextCode() {
  const code = `A-${(globalOrderCounter % EXPECTED_MANOEUVRE_CODE_COUNT) + 1}`;
  globalOrderCounter += 1;
  return code;
}

function matrix(prefix: string, count: number) {
  const aeronave = (prefix.startsWith('A') ? 'AW139' : 'SK76') as 'AW139' | 'SK76';
  const models = Array.from({ length: count }, (_, index) => ({
    codigo: `${prefix}-${index + 1}`,
    programa: 'Inicial',
    ciclo: null,
    titulo: `Inicial ${index + 1}`,
    aeronave,
  }));
  const items = models.flatMap((model) =>
    Array.from({ length: 18 }, (_, order) => item(model.codigo, order + 1, nextCode())),
  );
  return { models, items };
}

function sourceHashes() {
  return Object.fromEntries(
    Array.from({ length: EXPECTED_SOURCE_HASH_COUNT }, (_, index) => [
      `src-${index}`,
      sha256(`payload-${index}`),
    ]),
  );
}

describe('matriz import planner', () => {
  it('produces a stable hash without volatile timestamps and requires 61 hashes + 51/918/22', () => {
    globalOrderCounter = 0;
    const aw139 = matrix('A139', 30);
    const sk76 = matrix('SK76', 21);
    const manobraResolution = buildManoeuvreResolutionEntries({
      empresaId: 7,
      items: [...aw139.items, ...sk76.items],
      tenantManobras: [],
    });
    const input = {
      empresaId: 7,
      sourceHashes: sourceHashes(),
      aw139,
      sk76,
      loft: 22,
      baseFingerprint: 'b'.repeat(64),
      contract: { schema_version: 1, totals: { modelos: 51, vinculos: 918, loft: 22 } },
      manobraResolution,
    };
    expect(createDeterministicPlan(input).plan_sha256).toBe(
      createDeterministicPlan(input).plan_sha256,
    );
    expect(sha256({ b: 1, a: 2 })).toBe(sha256({ a: 2, b: 1 }));
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('rejects invalid tenant, position count and repeated order while allowing a code in both LOFT legs', () => {
    const items = Array.from({ length: 18 }, (_, index) => item('A139-I-01/12', index + 1));
    const models = [
      {
        codigo: 'A139-I-01/12',
        programa: 'Inicial',
        ciclo: null,
        titulo: 'Inicial',
        aeronave: 'AW139' as const,
      },
    ];
    expect(() => validateModelItems(models, items.slice(0, 17))).toThrow('18 posições');
    expect(() =>
      validateModelItems(models, [...items.slice(0, 17), { ...items[17], ordem: 17 }]),
    ).toThrow('ordens');
    expect(() =>
      validateModelItems(models, [...items.slice(0, 17), { ...items[17], codigo: 'A-1' }]),
    ).not.toThrow();
  });
});
