import { describe, expect, it } from 'vitest';

import {
  PTO_REV10_EXPECTED_PLAN_TOTALS,
  assertPtoRev10Plan,
  sealPtoRev10Plan,
} from '../../../scripts/lib/simuladores-pto-rev10-plan.mjs';

function makePlanPayload() {
  const models = Array.from({ length: 66 }, (_, modelIndex) => ({
    codigo: `MODEL-${String(modelIndex + 1).padStart(2, '0')}`,
    titulo: `Modelo ${modelIndex + 1}`,
    programa: 'Inicial',
    natureza: 'Instrução',
    tipo_estruturado: 'INICIAL',
    carga_sessao: '2 horas',
    duracao_estimada_minutos: 120,
    ordem_curricular: modelIndex + 1,
    aeronave: modelIndex < 31 ? 'AW139' : 'SK76',
  }));
  const items = models.flatMap((model) =>
    Array.from({ length: 18 }, (_, itemIndex) => ({
      modelo: model.codigo,
      ordem: itemIndex + 1,
      codigo: `MAN-${String(itemIndex + 1).padStart(2, '0')}`,
      nome: `Manobra ${itemIndex + 1}`,
      categoria: 'GERAL',
      execucao_pf: 'AB',
    })),
  );
  const uniqueCodes = [...new Set(items.map((item) => item.codigo))];
  return {
    schema_version: 1,
    kind: 'PTO_REV10_SIMULATORS',
    generated_at: '2026-07-31T00:00:00.000Z',
    versao_matriz: 'PTO-REV10-2026-07-30',
    empresa_id: 6,
    source_hashes: { 'AW139/ZIP': 'hash-aw', 'S76/ZIP': 'hash-s76' },
    base_fingerprint: 'fingerprint',
    catalog_fingerprint: 'catalog-fingerprint',
    superseded_models: [{ id: 77, codigo: 'OLD-SESSION', codigo_canonico: 'OLD-SESSION' }],
    totals: { ...PTO_REV10_EXPECTED_PLAN_TOTALS },
    models,
    items,
    notechs: Array.from({ length: 15 }, (_, index) => ({
      codigo: `NTS-${String(index + 1).padStart(2, '0')}`,
    })),
    instructor_examiner: { status: 'PENDING_COMPLETE_SESSION_METADATA', codes: 94, links: 108 },
    manobra_resolution: uniqueCodes.map((codigo) => ({
      codigo_canonico: codigo,
      resolution_type: 'TRUE_MISSING',
      create_payload: { codigo, nome: codigo, categoria: 'GERAL' },
      source_hash: `hash-${codigo}`,
      models_using: models.map((model) => model.codigo),
      expected_link_count: 66,
    })),
    safeguards: [],
  };
}

describe('PTO Rev10 sealed plan', () => {
  it('accepts the complete 66/1188/990 contract', () => {
    const plan = sealPtoRev10Plan(makePlanPayload());
    expect(assertPtoRev10Plan(plan)).toBe(true);
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
