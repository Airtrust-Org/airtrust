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
assert.ok(start >= 0 && end > start, 'must execute real read-only driver callback');
const callback = source.slice(start + 'frame.evaluate('.length, end + 1);

function fixture({ initialSelection = false, disabled = false, legacy = false } = {}) {
  const nextAttr = legacy ? 'data-next' : 'data-quiz-nextq';
  const dom = new JSDOM(`<!doctype html><html><body><main>
    <button data-quiz-choice="0" class="answer">Resposta A</button>
    <button data-quiz-choice="1" class="answer ${initialSelection ? 'selected' : ''}">Resposta B</button>
    <button ${nextAttr}="1" type="button" ${disabled ? 'disabled' : ''}>Próxima questão</button>
  </main></body></html>`, {
    url: 'https://qa.invalid',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  dom.window.Element.prototype.getBoundingClientRect = () =>
    ({ width: 150, height: 40, top: 10, left: 10, right: 160, bottom: 50 });
  const clicked = [];
  dom.window.document.querySelectorAll('button').forEach((el) => {
    el.addEventListener('click', () => {
      clicked.push(el.hasAttribute('data-quiz-choice') ? 'answer-' + el.dataset.quizChoice : 'next');
      if (el.hasAttribute('data-quiz-choice')) {
        dom.window.document.querySelectorAll('[data-quiz-choice]').forEach((choice) => choice.classList.remove('selected'));
        el.classList.add('selected');
      }
    });
  });
  const action = dom.window.eval(`(${callback})`);
  const step = (plan = [{ slideIndex: 10, indices: [1] }]) =>
    action({ plan, location: '10/42', allowAdaptiveRetry: false, requiredDecisionSlideIndices: [] });
  return { step, clicked, close: () => dom.window.close() };
}

test('course-authored answer precedes data-quiz-nextq, with genuine selection', () => {
  const f = fixture();
  try {
    assert.equal(f.step().type, 'inline-quiz-authored-answer');
    assert.deepEqual(f.clicked, ['answer-1']);
    assert.equal(f.step().type, 'inline-quiz-next-question');
    assert.deepEqual(f.clicked, ['answer-1', 'next']);
  } finally { f.close(); }
});

test('no authored answer means inconclusive, not an invented learner choice', () => {
  const f = fixture();
  try {
    assert.equal(f.step([]).type, 'inline-quiz-authored-answer-missing');
    assert.deepEqual(f.clicked, []);
  } finally { f.close(); }
});

test('native disabled gate cannot be bypassed even with a selected response', () => {
  const f = fixture({ initialSelection: true, disabled: true });
  try {
    assert.equal(f.step().type, 'inline-quiz-question-gate-blocked');
    assert.deepEqual(f.clicked, []);
  } finally { f.close(); }
});

test('existing data-next navigation is preserved after actual answer selection', () => {
  const f = fixture({ legacy: true, initialSelection: true });
  try {
    assert.equal(f.step().type, 'inline-quiz-next');
    assert.deepEqual(f.clicked, ['next']);
  } finally { f.close(); }
});
