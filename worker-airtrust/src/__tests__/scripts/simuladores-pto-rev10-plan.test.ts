import { describe, expect, it } from 'vitest';

import {
  PTO_REV10_EXPECTED_PLAN_TOTALS,
  PTO_REV10_V18_EXPECTED_PLAN_TOTALS,
  assertPtoRev10Plan,
  sealPtoRev10Plan,
} from '../../../scripts/lib/simuladores-pto-rev10-plan.mjs';

const FUNCTIONAL_SESSION_CODES = [
  'INST-E01',
  'INST-E02',
  'EXA-01/04',
  'EXA-02/04',
  'EXA-03/04',
  'EXA-04/04',
];

function makePlanPayload(v18 = false) {
  const aircraftModels = Array.from({ length: v18 ? 82 : 66 }, (_, modelIndex) => ({
    codigo: `MODEL-${String(modelIndex + 1).padStart(2, '0')}`,
    titulo: `Modelo ${modelIndex + 1}`,
    programa: 'Inicial',
    natureza: 'Instrução',
    tipo_estruturado: 'INICIAL',
    carga_sessao: '2 horas',
    duracao_estimada_minutos: 120,
    ordem_curricular: modelIndex + 1,
    aeronave: modelIndex < (v18 ? 37 : 31) ? 'AW139' : 'SK76',
  }));
  const functionalModels = FUNCTIONAL_SESSION_CODES.map((codigo, index) => ({
    codigo,
    titulo: `Sessão funcional ${index + 1}`,
    programa: codigo.startsWith('INST') ? 'Treinamento de Instrutor' : 'Treinamento de Examinador',
    natureza: 'Instrução prática',
    tipo_estruturado: codigo.startsWith('INST') ? 'INSTRUTOR' : 'EXAMINADOR',
    carga_sessao: codigo === 'INST-E02' ? '2 horas' : '1 hora',
    duracao_estimada_minutos: codigo === 'INST-E02' ? 120 : 60,
    ordem_curricular: index + 1,
    aeronave: null,
  }));
  const models = [...aircraftModels, ...functionalModels];
  const aircraftItems = aircraftModels.flatMap((model) =>
    Array.from({ length: 18 }, (_, itemIndex) => ({
      modelo: model.codigo,
      ordem: itemIndex + 1,
      codigo: `MAN-${String(itemIndex + 1).padStart(2, '0')}`,
      nome: `Manobra ${itemIndex + 1}`,
      categoria: 'GERAL',
      execucao_pf: 'AB',
    })),
  );
  const functionalCatalog = Array.from({ length: 94 }, (_, index) => ({
    codigo: `FUNC-${String(index + 1).padStart(3, '0')}`,
    nome: `Competência funcional ${index + 1}`,
    categoria: index < 34 ? 'Instrutor' : 'Examinador',
  }));
  const functionalItems = functionalModels.flatMap((model, modelIndex) =>
    Array.from({ length: 18 }, (_, itemIndex) => {
      const catalog = functionalCatalog[(modelIndex * 18 + itemIndex) % functionalCatalog.length];
      return {
        modelo: model.codigo,
        ordem: itemIndex + 1,
        codigo: catalog.codigo,
        nome: catalog.nome,
        categoria: catalog.categoria,
        execucao_pf: 'AB',
      };
    }),
  );
  const items = [...aircraftItems, ...functionalItems];
  const uniqueCodes = [...new Set(items.map((item) => item.codigo))];
  return {
    schema_version: v18 ? 2 : 1,
    ...(v18 ? { approved_source_sha256: '040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912', canonical_contract_sha256: 'a'.repeat(64) } : {}),
    kind: 'PTO_REV10_SIMULATORS',
    generated_at: '2026-07-31T00:00:00.000Z',
    versao_matriz: 'PTO-REV10-2026-07-30',
    empresa_id: 6,
    source_hashes: { 'AW139/ZIP': 'hash-aw', 'S76/ZIP': 'hash-s76' },
    base_fingerprint: 'fingerprint',
    catalog_fingerprint: 'catalog-fingerprint',
    superseded_models: [{ id: 77, codigo: 'OLD-SESSION', codigo_canonico: 'OLD-SESSION' }],
    totals: { ...(v18 ? PTO_REV10_V18_EXPECTED_PLAN_TOTALS : PTO_REV10_EXPECTED_PLAN_TOTALS) },
    models,
    items,
    notechs: Array.from({ length: 15 }, (_, index) => ({
      codigo: `NTS-${String(index + 1).padStart(2, '0')}`,
    })),
    functional_catalog: functionalCatalog,
    instructor_examiner: { status: 'IMPORTED', sessions: 6, codes: 94, links: 108 },
    manobra_resolution: uniqueCodes.map((codigo) => ({
      codigo_canonico: codigo,
      resolution_type: 'TRUE_MISSING',
      create_payload: { codigo, nome: codigo, categoria: 'GERAL' },
      source_hash: `hash-${codigo}`,
      models_using: models.map((model) => model.codigo),
      expected_link_count: items.filter((item) => item.codigo === codigo).length,
    })),
    safeguards: [],
  };
}

describe('PTO Rev10 sealed plan', () => {
  it('accepts the historical 72/1296/1080 contract for readback compatibility', () => {
    const plan = sealPtoRev10Plan(makePlanPayload());
    expect(assertPtoRev10Plan(plan)).toBe(true);
  });

  it('accepts the V18 88/1584/1320 plan schema 2', () => {
    const plan = sealPtoRev10Plan(makePlanPayload(true));
    expect(assertPtoRev10Plan(plan)).toBe(true);
  });

  it('rejects V18 plan without approved source hash', () => {
    const payload = makePlanPayload(true);
    delete (payload as Record<string, unknown>).approved_source_sha256;
    expect(() => assertPtoRev10Plan(sealPtoRev10Plan(payload))).toThrow('documento aprovado não comprovado');
  });

  it('fails closed when content is changed after sealing', () => {
    const plan = sealPtoRev10Plan(makePlanPayload());
    plan.models[0].titulo = 'Adulterado';
    expect(() => assertPtoRev10Plan(plan)).toThrow('plan_sha256 adulterado');
  });

  it('rejects a model without exactly 18 ordered technical items', () => {
    const payload = makePlanPayload();
    payload.items.pop();
    payload.totals.links -= 1;
    const plan = sealPtoRev10Plan(payload);
    expect(() => assertPtoRev10Plan(plan)).toThrow('total links');
  });
});
