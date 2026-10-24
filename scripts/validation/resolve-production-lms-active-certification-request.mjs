#!/usr/bin/env node
// Resolve production LMS active-course certification requests from workflow_dispatch or a PR comment.
// Side-effect free: validates untrusted text and emits normalized GitHub outputs only.
const eventName = String(process.env.EVENT_NAME || '');

let confirmation;
let expectedSha;
let courseIds = '';
let prNumber = '';
let requestSource;

if (eventName === 'issue_comment') {
  const issueNumber = String(process.env.ISSUE_NUMBER || '').trim();
  const commentActor = String(process.env.COMMENT_ACTOR || '').trim();
  const githubActor = String(process.env.GITHUB_ACTOR || '').trim();
  const body = String(process.env.COMMENT_BODY || '');

  if (!/^[1-9][0-9]*$/.test(issueNumber)) throw new Error('COMMENT_PR_NUMBER_INVALID');
  if (!commentActor || commentActor !== githubActor) throw new Error('COMMENT_ACTOR_MISMATCH');
  if (body.includes('\n') || body.includes('\r')) throw new Error('COMMENT_COMMAND_MUST_BE_SINGLE_LINE');

  const match = body.match(/^AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY ([0-9a-fA-F]{40})(?: ([0-9]+(?:,[0-9]+)*))?$/);
  if (!match) throw new Error('COMMENT_COMMAND_INVALID');

  confirmation = 'AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY';
  expectedSha = match[1].toLowerCase();
  courseIds = String(match[2] || '');
  prNumber = issueNumber;
  requestSource = 'issue_comment';
} else if (eventName === 'workflow_dispatch') {
  confirmation = String(process.env.INPUT_CONFIRMATION || '').trim();
  expectedSha = String(process.env.INPUT_EXPECTED_SHA || '').trim().toLowerCase();
  courseIds = String(process.env.INPUT_COURSE_IDS || '').trim();
  requestSource = 'workflow_dispatch';
} else {
  throw new Error(`UNSUPPORTED_EVENT:${eventName}`);
}

if (confirmation !== 'AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY') throw new Error('CONFIRMATION_REJECTED');
if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXPECTED_SHA_INVALID');
if (courseIds && !/^[0-9]+(?:,[0-9]+)*$/.test(courseIds)) throw new Error('COURSE_IDS_INVALID');

const outputs = {
  confirmation,
  expected_sha: expectedSha,
  course_ids: courseIds,
  pr_number: prNumber,
  request_source: requestSource,
};

for (const [key, value] of Object.entries(outputs)) {
  if (/[\r\n]/.test(String(value))) throw new Error('OUTPUT_NEWLINE_FORBIDDEN');
  console.log(`${key}=${value}`);
}
