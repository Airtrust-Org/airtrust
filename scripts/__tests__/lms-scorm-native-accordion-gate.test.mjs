import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'scripts/validation/production-lms-active-course-certification-readonly.mjs'), 'utf8');
const startMarker = 'frame.evaluate(({ plan, location, allowAdaptiveRetry, requiredDecisionSlideIndices }) => {';
const endMarker = '}, { plan: answerPlan, location: currentLocation, allowAdaptiveRetry, requiredDecisionSlideIndices }).catch';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start, 'real in-frame callback is required');
const callback = source.slice(start + 'frame.evaluate('.length, end + 1);

function fixture() {
  const dom = new JSDOM(`<!doctype html><html><body><main>
    <article><details><summary>Conteúdo 1</summary><p>Explicação</p></details>
    <details><summary>Conteúdo 2</summary><p>Procedimento</p></details></article>
    <button id="nextUnit" type="button" disabled>Próxima unidade</button>
  </main></body></html>`, { url: 'https://qa.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.Element.prototype.getBoundingClientRect = () =>
    ({ width: 140, height: 28, top: 10, left: 10, right: 150, bottom: 38 });
  const cb = dom.window.eval(`(${callback})`);
  const step = () => cb({ plan: [], location: '3/55', allowAdaptiveRetry: false, requiredDecisionSlideIndices: [] });
  const clickTrusted = (action) => {
    assert.equal(action.type, 'accordion-read-summary');
    assert.ok(action.trusted_click_token);
    const el = dom.window.document.querySelector('[data-airtrust-cert-click]');
    assert.ok(el);
    el.click();
    el.removeAttribute('data-airtrust-cert-click');
  };
  return { dom, step, clickTrusted, close: () => dom.window.close() };
}

test('course-authored accordion summaries are read by real click, one at a time', () => {
  const f = fixture();
  try {
    assert.equal(f.dom.window.document.querySelectorAll('details[open]').length, 0);
    f.clickTrusted(f.step());
    assert.equal(f.dom.window.document.querySelectorAll('details[open]').length, 1);
    f.clickTrusted(f.step());
    assert.equal(f.dom.window.document.querySelectorAll('details[open]').length, 2);
  } finally { f.close(); }
});

test('disabled nextUnit after reading remains blocked without synthesized progress', () => {
  const f = fixture();
  try {
    f.clickTrusted(f.step());
    f.clickTrusted(f.step());
    assert.equal(f.step().type, 'accordion-gate-unresolved');
    assert.equal(f.dom.window.document.querySelector('#nextUnit').disabled, true);
  } finally { f.close(); }
});
