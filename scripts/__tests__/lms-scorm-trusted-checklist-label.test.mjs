import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'scripts/validation/production-lms-active-course-certification-readonly.mjs'), 'utf8');
const startMarker = 'frame.evaluate(({ plan, location, allowAdaptiveRetry, requiredDecisionSlideIndices, checklistSlideIndices }) => {';
const endMarker = '}, { plan: answerPlan, location: currentLocation, allowAdaptiveRetry, requiredDecisionSlideIndices, checklistSlideIndices }).catch';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, 'test must invoke the real browser driver');
const callback = source.slice(start + 'frame.evaluate('.length, end + 1);

function fixture({ withoutLabels = false, allChecked = false } = {}) {
  const labels = withoutLabels ? '' : '<label for="check0">Primeira leitura</label><label for="check1">Segunda leitura</label>';
  const dom = new JSDOM(`<!doctype html><html><body><main>
    <section class="checklist">
      <input type="checkbox" id="check0" style="display:none" ${allChecked ? 'checked' : ''}>
      <input type="checkbox" id="check1" style="display:none" ${allChecked ? 'checked' : ''}>
      ${labels}
    </section>
    <button id="next" data-next="1" disabled>Avançar</button>
  </main></body></html>`, {
    url: 'https://qa.invalid', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  dom.window.Element.prototype.getBoundingClientRect = () =>
    ({ width: 145, height: 30, top: 10, left: 10, right: 155, bottom: 40 });
  const inputs = Array.from(dom.window.document.querySelectorAll('input[type=checkbox]'));
  const button = dom.window.document.querySelector('#next');
  inputs.forEach((input) => input.addEventListener('change', () => {
    button.disabled = !inputs.every((item) => item.checked);
  }));
  const cb = dom.window.eval(`(${callback})`);
  const step = () => cb({ plan: [], location: '10/56', allowAdaptiveRetry: false,
    requiredDecisionSlideIndices: [], checklistSlideIndices: [10] });
  const clickTrusted = (action) => {
    assert.equal(action.type, 'checklist-native-click');
    assert.ok(action.trusted_click_token);
    const target = dom.window.document.querySelector('[data-airtrust-cert-click]');
    assert.ok(target);
    target.click();
    target.removeAttribute('data-airtrust-cert-click');
  };
  return { dom, inputs, button, step, clickTrusted, close: () => dom.window.close() };
}

test('visually hidden native inputs are checked only through real label clicks', () => {
  const f = fixture();
  try {
    assert.deepEqual(f.inputs.map((i) => i.checked), [false, false]);
    f.clickTrusted(f.step());
    assert.deepEqual(f.inputs.map((i) => i.checked), [true, false]);
    f.clickTrusted(f.step());
    assert.deepEqual(f.inputs.map((i) => i.checked), [true, true]);
    assert.equal(f.button.disabled, false);
  } finally { f.close(); }
});

test('missing visible label cannot cause synthetic checkbox completion', () => {
  const f = fixture({ withoutLabels: true });
  try {
    assert.equal(f.step().type, 'checklist-control-unresolved');
    assert.deepEqual(f.inputs.map((i) => i.checked), [false, false]);
  } finally { f.close(); }
});

test('all checked but disabled Next remains an explicit unresolved gate', () => {
  const f = fixture({ allChecked: true });
  try {
    assert.equal(f.step().type, 'checklist-gate-unresolved');
    assert.equal(f.button.disabled, true);
  } finally { f.close(); }
});
