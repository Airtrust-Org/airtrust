import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { evaluateListing } from '../operations/pto-v18-guide-validation-lib.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../operations/pto-v18-guide-release-manifest.json', import.meta.url), 'utf8'),
);
const listing = () => manifest.guias.map((m, i) => ({
  id: i + 1, codigo: m.codigo, programa: m.programa,
  modelo_aeronave_id: m.modelo_aeronave_id, modelo_sessao_id: m.modelo_sessao_id,
}));

test('manifesto: 88 guias, 88 modelos de sessão distintos, 37/45/6', () => {
  assert.equal(manifest.guias.length, 88);
  assert.equal(new Set(manifest.guias.map((g) => g.modelo_sessao_id)).size, 88);
  const ev = evaluateListing(listing(), manifest);
  assert.deepEqual(ev.porAeronave, { AW139: 37, S76: 45, FUNCIONAL: 6 });
  assert.equal(ev.cruzados, 0);
  assert.equal(ev.modelosDistintos, 88);
  assert.equal(ev.codigosPresentes, true);
});

test('vínculos trocados entre um guia AW139 e um S76 são detectados (88 IDs continuam distintos)', () => {
  const rows = listing();
  const a = rows.find((r) => r.codigo.startsWith('A139-'));
  const s = rows.find((r) => r.codigo.startsWith('S76-'));
  [a.modelo_sessao_id, s.modelo_sessao_id] = [s.modelo_sessao_id, a.modelo_sessao_id];
  const ev = evaluateListing(rows, manifest);
  assert.equal(ev.modelosDistintos, 88);
  assert.equal(ev.cruzados, 2);
});

test('aeronave ou programa trocados e guia desconhecido são detectados', () => {
  const rows = listing();
  rows[0].modelo_aeronave_id = rows[0].modelo_aeronave_id === 5 ? 6 : 5;
  rows[1].programa = 'CHECK';
  rows[2].codigo = 'A139-X-99/99@PTO-REV10-V18';
  assert.equal(evaluateListing(rows, manifest).cruzados, 3);
});
