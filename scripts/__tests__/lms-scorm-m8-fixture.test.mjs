import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, zipSync, strFromU8 } from 'fflate';
import { buildInteractiveM8QaFiles } from '../staging/lms-scorm-m8-fixture.mjs';

test('staging acceptance ZIP has an actual authored M8 assessment, not automatic status passed', () => {
  const files = unzipSync(zipSync(buildInteractiveM8QaFiles('qa-course', 'qa-version')));
  const read = (key) => strFromU8(files[key]);
  const model = JSON.parse(read('course-model.js').replace(/^window.AIRTRUST_COURSE_MODEL = /, '').replace(/;$/, ''));
  const deck = JSON.parse(read('course_data.js').replace(/^window.COURSE_DATA = /, '').replace(/;$/, ''));
  assert.equal(model.schema, 'AIRTRUST_TRAINING_MODEL_M8');
  assert.deepEqual(model.slides.map(x => x.id), ['qa-slide-1']);
  assert.equal(deck.slides[0].questions[0].answer, 1);
  assert.ok(files['media/qa-visual.svg']);
  assert.match(read('app.js'), /LMSInitialize/);
  assert.match(read('app.js'), /LMSCommit/);
  assert.match(read('app.js'), /LMSFinish/);
  assert.match(read('app.js'), /addEventListener\('click'/);
  assert.match(read('app.js'), /state\.assess\[1\]\.passed = true/);
  assert.match(read('app.js'), /state\.done = \[0\]/);
  assert.match(read('app.js'), /cmi\.core\.lesson_status', 'passed'/);
});
