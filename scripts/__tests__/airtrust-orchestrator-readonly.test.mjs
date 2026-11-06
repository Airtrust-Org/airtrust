import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyIssue, classifyPr, buildQueue, eventIdentity,
} from '../ops/airtrust-orchestrator-readonly.mjs';

describe('AirTrust read-only coordinator', () => {
  it('routes the known concurrent alerts issue to Gemini without implying release readiness', () => {
    assert.deepEqual(classifyIssue({ number: 1959, labels: [] }), {
      kind: 'issue', number: 1959, owner: 'gemini-compliance',
      priority: 1, state: 'OPEN', key: 'Airtrust-Org/airtrust:issue:1959',
    });
  });
  it('does not misclassify a draft PR as release-ready', () => {
    const pr = classifyPr({ number: 1623, draft: true, head: { sha: 'a'.repeat(40) } });
    assert.equal(pr.state, 'DRAFT');
    assert.equal(pr.owner, 'codex-pilot-frms');
  });
  it('excludes PR shadow issues and preserves unknown ownership', () => {
    const queue = buildQueue([
      { number: 776 }, { number: 1959 }, { number: 7777 },
      { number: 1623, pull_request: { url: 'https://example.invalid' } },
    ], [{ number: 1623, draft: true, head: { sha: 'a'.repeat(40) } }]);
    assert.equal(queue.issues.length, 3);
    assert.equal(queue.prs.length, 1);
    assert.equal(queue.issues[0].number, 1959);
    assert.equal(queue.issues[1].owner, 'unassigned');
    assert.equal(queue.issues[2].number, 776);
  });
  it('uses stable source-event identity instead of a fabricated agent run', () => {
    const e = { workflow_run: { id: 123, run_attempt: 2, conclusion: 'success' } };
    assert.equal(eventIdentity('workflow_run', e, 'unused'), 'workflow_run:123:2:success');
    assert.equal(eventIdentity('issue_comment', { comment: { id: 99 } }, 'unused'), 'issue_comment:99');
  });
  it('does not confuse merged PRs with open work', () => {
    const queue = buildQueue([{ number: 500 }], []);
    assert.equal(queue.prs.length, 0);
    assert.equal(queue.issues[0].priority, 0);
  });
  it('uses exact PR SHA to distinguish successive candidates', () => {
    const a = classifyPr({ number: 2019, head: { sha: 'a'.repeat(40) } });
    const b = classifyPr({ number: 2019, head: { sha: 'b'.repeat(40) } });
    assert.notEqual(a.key, b.key);
    assert.equal(a.owner, 'gemini-compliance');
  });
});
