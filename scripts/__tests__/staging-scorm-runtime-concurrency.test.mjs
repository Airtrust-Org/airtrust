import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflows = [
  '.github/workflows/deploy-staging.yml',
  '.github/workflows/staging-lms-scorm-qa.yml',
  '.github/workflows/staging-d1-schema-change.yml',
];
const expectedGroup = 'airtrust-staging-mutations-and-scorm-qa';

test('staging mutations and SCORM browser QA use the same non-canceling runtime lock', () => {
  for (const file of workflows) {
    const yaml = readFileSync(file, 'utf8');
    const match = yaml.match(/^concurrency:\s*\n\s+group:\s*([^\n]+)\n\s+cancel-in-progress:\s*(\S+)/m);
    assert.ok(match, `workflow ${file} must declare an explicit concurrency policy`);
    assert.equal(match[1].trim(), expectedGroup, `wrong staging runtime lock in ${file}`);
    assert.equal(match[2].trim(), 'false', `never cancel in-progress staging writes: ${file}`);
  }
});
