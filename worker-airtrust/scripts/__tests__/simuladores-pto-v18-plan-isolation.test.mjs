import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPtoV18ModelIsolation } from '../lib/simuladores-pto-v18-plan-isolation.mjs';

function fixture() {
  const models = [
    ...Array.from({ length: 37 }, (_, i) => ({
      codigo: `A139-I-${i + 1}`, aeronave: 'AW139', tipo_estruturado: 'INICIAL',
    })),
    ...Array.from({ length: 45 }, (_, i) => ({
      codigo: `S76-I-${i + 1}`, aeronave: 'SK76', tipo_estruturado: 'INICIAL',
    })),
    ...['INST-E01', 'INST-E02'].map((codigo) => ({
      codigo, aeronave: null, tipo_estruturado: 'INSTRUTOR',
    })),
    ...['EXA-01/04', 'EXA-02/04', 'EXA-03/04', 'EXA-04/04'].map((codigo) => ({
      codigo, aeronave: null, tipo_estruturado: 'EXAMINADOR',
    })),
  ];
  const functional_catalog = Array.from({ length: 94 }, (_, i) => ({
    codigo: `FUNC-${i + 1}`,
  }));
  const items = models.flatMap((model, index) =>
    Array.from({ length: 18 }, (_, i) => ({
      modelo: model.codigo,
      aeronave: model.aeronave,
      codigo: model.aeronave === null ? functional_catalog[(index * 18 + i) % 94].codigo :
        `${model.aeronave}-PROC-${i + 1}`,
      ordem: i + 1,
    })),
  );
  const notechs = Array.from({ length: 15 }, (_, i) => ({ codigo: `NTS-${i + 1}` }));
  return { models, items, notechs, functional_catalog };
}

test('aceita somente a estrutura 37 AW139, 45 S76 e 6 funcionais sem mistura', () => {
  assert.equal(assertPtoV18ModelIsolation(fixture()), true);
});

test('bloqueia troca de aeronave de sessão sem mudar o total de modelos', () => {
  const plan = fixture();
  plan.models[0].aeronave = 'SK76';
  assert.throws(() => assertPtoV18ModelIsolation(plan), /sessão de aeronave incompatível/);
});

test('bloqueia vínculo AW139 inserido dentro de sessão S76', () => {
  const plan = fixture();
  plan.items[37 * 18].aeronave = 'AW139';
  assert.throws(() => assertPtoV18ModelIsolation(plan), /vínculo de aeronave cruzado/);
});

test('bloqueia uso de código funcional em modelo de aeronave', () => {
  const plan = fixture();
  plan.items[0].codigo = 'FUNC-1';
  assert.throws(() => assertPtoV18ModelIsolation(plan), /competência funcional no grupo errado/);
});

test('bloqueia competências NOTECHS duplicadas mesmo com comprimento 15', () => {
  const plan = fixture();
  plan.notechs[14].codigo = plan.notechs[0].codigo;
  assert.throws(() => assertPtoV18ModelIsolation(plan), /NOTECHS ausente\/duplicada/);
});

test('bloqueia sessão funcional com código/aeronave de helicóptero', () => {
  const plan = fixture();
  plan.models[82].aeronave = 'AW139';
  assert.throws(() => assertPtoV18ModelIsolation(plan), /sessão funcional/);
});

test('bloqueia currículo com apenas 87 modelos, mesmo que números declarados digam 88', () => {
  const plan = fixture();
  plan.models.pop();
  assert.throws(() => assertPtoV18ModelIsolation(plan), /88 modelos/);
});
