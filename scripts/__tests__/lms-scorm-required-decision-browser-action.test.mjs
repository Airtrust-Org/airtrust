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
assert.ok(start >= 0 && end > start, 'the tested callback must be the real in-frame driver');
const callback = source.slice(start + 'frame.evaluate('.length, end + 1);

function fixture(withChoice = true) {
  const dom = new JSDOM(`<!doctype html><html><body><main>
    ${withChoice ? '<button data-scenario="choice-one" type="button">Escolher ação</button>' : ''}
    <button id="next" type="button">Próximo</button>
  </main></body></html>`, {
    url: 'https://qa.invalid',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  dom.window.Element.prototype.getBoundingClientRect = () =>
    ({ width: 160, height: 40, top: 12, left: 12, right: 172, bottom: 52 });
  const clicked = [];
  dom.window.document.querySelectorAll('button').forEach((element) => {
    element.addEventListener('click', () => clicked.push(element.id || element.dataset.scenario));
  });
  const action = dom.window.eval(`(${callback})`);
  const step = (requiredDecisionSlideIndices = [9], plan = [{ slideIndex: 9, indices: [0] }]) =>
    action({ plan, location: '9/126', allowAdaptiveRetry: false, requiredDecisionSlideIndices });
  return { step, clicked, close: () => dom.window.close() };
}

test('required authored scenario is clicked before visible Next and then navigates', () => {
  const f = fixture();
  try {
    assert.equal(f.step().type, 'required-decision-choice');
    assert.deepEqual(f.clicked, ['choice-one']);
    assert.equal(f.step().type, 'next');
    assert.deepEqual(f.clicked, ['choice-one', 'next']);
  } finally { f.close(); }
});

test('non-required slide preserves navigation-first behavior', () => {
  const f = fixture();
  try {
    assert.equal(f.step([]).type, 'next');
    assert.deepEqual(f.clicked, ['next']);
  } finally { f.close(); }
});

test('visible scenario without an authored answer mapping does not guess', () => {
  const f = fixture();
  try {
    assert.equal(f.step([9], []).type, 'required-decision-unresolved');
    assert.deepEqual(f.clicked, []);
  } finally { f.close(); }
});

test('unresolved required scenario does not invent an answer or click Next', () => {
  const f = fixture(false);
  try {
    assert.equal(f.step().type, 'required-decision-unresolved');
    assert.deepEqual(f.clicked, []);
  } finally { f.close(); }
});
