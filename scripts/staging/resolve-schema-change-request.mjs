#!/usr/bin/env node
// Resolve staging Schema V2 requests from either workflow_dispatch or a PR issue_comment.
// This parser is intentionally side-effect free: it only validates untrusted event/input text
// and emits normalized key=value pairs for the governed workflow guard.
const eventName = String(process.env.EVENT_NAME || '');
const normalizeReason = (value) => String(value || '').trim().replace(/\s+/g, ' ');

let confirmation;
let prNumber;
let releaseSha;
let approvedMigration;
let releaseReason;

if (eventName === 'issue_comment') {
  const issueNumber = String(process.env.ISSUE_NUMBER || '');
  const commentActor = String(process.env.COMMENT_ACTOR || '');
  const githubActor = String(process.env.GITHUB_ACTOR || '');
  const body = String(process.env.COMMENT_BODY || '');

  if (!/^[1-9][0-9]*$/.test(issueNumber)) throw new Error('COMMENT_PR_NUMBER_INVALID');
  if (!commentActor || commentActor !== githubActor) throw new Error('COMMENT_ACTOR_MISMATCH');
  if (body.includes('\n') || body.includes('\r')) throw new Error('COMMENT_COMMAND_MUST_BE_SINGLE_LINE');

  const match = body.match(
    /^AIRTRUST_STAGING_SCHEMA_CHANGE ([0-9]{4}_[a-z0-9_]+\.sql) ([0-9a-f]{40}) (.{1,400})$/,
  );
  if (!match) throw new Error('COMMENT_COMMAND_INVALID');

  confirmation = 'AIRTRUST_STAGING_SCHEMA_CHANGE';
  prNumber = issueNumber;
  approvedMigration = match[1];
  releaseSha = match[2];
  releaseReason = normalizeReason(match[3]);
} else if (eventName === 'workflow_dispatch') {
  confirmation = String(process.env.INPUT_CONFIRMATION || '').trim();
  prNumber = String(process.env.INPUT_PR_NUMBER || '').trim();
  releaseSha = String(process.env.INPUT_RELEASE_SHA || '').trim().toLowerCase();
  approvedMigration = String(process.env.INPUT_APPROVED_MIGRATION || '').trim();
  releaseReason = normalizeReason(process.env.INPUT_RELEASE_REASON);
} else {
  throw new Error(`UNSUPPORTED_EVENT:${eventName}`);
}

if (!releaseReason || releaseReason.length > 400) throw new Error('RELEASE_REASON_INVALID');
if (Object.values({ confirmation, prNumber, releaseSha, approvedMigration }).some((value) => /[\r\n]/.test(String(value)))) {
  throw new Error('OUTPUT_NEWLINE_FORBIDDEN');
}

const outputs = {
  confirmation,
  pr_number: prNumber,
  release_sha: releaseSha,
  approved_migration: approvedMigration,
  release_reason: releaseReason,
};

for (const [key, value] of Object.entries(outputs)) console.log(`${key}=${value}`);
