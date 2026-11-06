#!/usr/bin/env node
/**
 * AirTrust coordinator V1: read-only snapshot, not an AI executor.
 * Deliberately no GitHub writes, no Cloudflare tokens, no deploy permissions.
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

export const ISSUE_OWNERS = Object.freeze({
  776: 'coordination', 500: 'gemini-security', 2014: 'gemini-security',
  1760: 'gemini-security', 1959: 'gemini-compliance',
  1492: 'gemini-compliance', 1381: 'gemini-compliance',
  1382: 'gemini-compliance', 1279: 'gemini-compliance',
  1287: 'gemini-compliance', 1479: 'coordination',
  1671: 'coordination', 1107: 'engineering',
  1106: 'engineering', 1325: 'codex-lms',
  1541: 'codex-lms', 1311: 'codex-lms',
  1212: 'codex-lms', 1323: 'codex-lms',
  1661: 'codex-lms', 1467: 'codex-lms',
  1373: 'codex-pilot-frms', 1426: 'codex-pilot-frms',
  1476: 'codex-pilot-frms', 93: 'codex-pilot-frms',
});
export const PR_OWNERS = Object.freeze({
  2019: 'gemini-compliance', 1623: 'codex-pilot-frms',
  1873: 'codex-lms', 1662: 'codex-lms',
  1647: 'codex-lms', 1650: 'codex-frms-boa',
  1917: 'engineering', 1921: 'engineering',
  1809: 'engineering', 1806: 'engineering',
  1172: 'engineering', 825: 'engineering', 824: 'engineering',
});
const P0 = new Set([500, 1325, 1479, 1541, 2014]);
const P1 = new Set([1959, 1492, 1760, 1373, 1426, 1476, 1311, 1212, 1323]);
const SAFE_REPOSITORY = 'Airtrust-Org/airtrust';

export function eventIdentity(eventName, event, sha) {
  if (eventName === 'workflow_run')
    return 'workflow_run:' + event.workflow_run?.id + ':' + event.workflow_run?.run_attempt + ':' + event.workflow_run?.conclusion;
  if (eventName === 'pull_request')
    return 'pull_request:' + event.pull_request?.number + ':' + event.pull_request?.head?.sha + ':' + event.action;
  if (eventName === 'issue_comment')
    return 'issue_comment:' + event.comment?.id;
  if (eventName === 'issues')
    return 'issues:' + event.issue?.number + ':' + event.issue?.updated_at + ':' + event.action;
  if (eventName === 'schedule') return 'schedule:' + new Date().toISOString().slice(0, 10);
  return eventName + ':' + sha;
}

export function classifyIssue(issue) {
  const number = issue.number;
  const labels = (issue.labels || []).map((label) => String(typeof label === 'string' ? label : label.name || '').toLowerCase());
  let priority = P0.has(number) || labels.some((x) => /(^|\W)p0(\W|$)/i.test(x)) ? 0 :
    P1.has(number) || labels.some((x) => /(^|\W)p1(\W|$)/i.test(x)) ? 1 : 2;
  if (number === 776) priority = 3;
  return {
    kind: 'issue', number, owner: ISSUE_OWNERS[number] || 'unassigned',
    priority, state: 'OPEN', key: SAFE_REPOSITORY + ':issue:' + number,
  };
}

export function classifyPr(pr) {
  return {
    kind: 'pr', number: pr.number, owner: PR_OWNERS[pr.number] || 'unassigned',
    state: pr.draft ? 'DRAFT' : 'OPEN',
    headSha: String(pr.head?.sha || ''),
    key: SAFE_REPOSITORY + ':pr:' + pr.number + ':' + String(pr.head?.sha || ''),
  };
}

export function buildQueue(issues, prs) {
  const entries = issues.filter((x) => !x.pull_request).map(classifyIssue);
  const prEntries = prs.map(classifyPr);
  entries.sort((a, b) => a.priority - b.priority || a.number - b.number);
  prEntries.sort((a, b) => a.number - b.number);
  return { issues: entries, prs: prEntries };
}

async function getJson(path, token) {
  const url = 'https://api.github.com/repos/' + SAFE_REPOSITORY + '/' + path;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'airtrust-orchestrator-readonly-v1',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('GITHUB_READ_FAILED:' + response.status + ':' + path.split('?')[0]);
  return response.json();
}

async function listAll(path, token) {
  const result = [];
  for (let page = 1; page <= 6; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const rows = await getJson(path + separator + 'per_page=100&page=' + page, token);
    if (!Array.isArray(rows)) throw new Error('GITHUB_LIST_NOT_ARRAY');
    if (page === 6) throw new Error('GITHUB_LIST_EXCEEDS_500_ITEMS');
    result.push(...rows);
    if (rows.length < 100) return result;
  }
  throw new Error('UNREACHABLE_PAGINATION');
}

async function productionSha() {
  try {
    const response = await fetch('https://api.airtrust.online/api/version', {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
    });
    const sha = response.headers.get('x-airtrust-source-sha');
    return response.ok && /^[a-f0-9]{40}$/.test(String(sha)) ? sha : null;
  } catch {
    return null; // Unknown never means published or healthy.
  }
}

export async function main(env = process.env) {
  if (env.GITHUB_REPOSITORY !== SAFE_REPOSITORY) throw new Error('REPOSITORY_DENIED');
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN_MISSING');
  if (!env.GITHUB_EVENT_PATH) throw new Error('EVENT_PATH_MISSING');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const [issues, prs, head, deployed] = await Promise.all([
    listAll('issues?state=open', env.GITHUB_TOKEN),
    listAll('pulls?state=open', env.GITHUB_TOKEN),
    getJson('git/ref/heads/main', env.GITHUB_TOKEN),
    productionSha(),
  ]);
  const sha = String(head?.object?.sha || '');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('MAIN_SHA_UNVERIFIED');
  const queue = buildQueue(issues, prs);
  const snapshot = {
    schemaVersion: 1,
    mode: 'READ_ONLY',
    repository: SAFE_REPOSITORY,
    eventKey: eventIdentity(env.GITHUB_EVENT_NAME, event, sha),
    mainSha: sha,
    productionWorkerSha: deployed,
    productionVerification: deployed ? 'SOURCE_SHA_READ' : 'UNKNOWN',
    issueCount: queue.issues.length,
    prCount: queue.prs.length,
    queue,
    agentExecutionsStarted: 0,
    githubApiMutations: 0,
    cloudflareWrites: 0,
    persistentDispatchEnabled: false,
    note: 'Snapshot only. No claims of CI readiness, idempotent dispatch, active agents or release authorization.',
  };
  const location = env.AIRTRUST_ORCHESTRATOR_OUTPUT || 'airtrust-orchestrator-snapshot.json';
  writeFileSync(location, JSON.stringify(snapshot, null, 2) + '\n');
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY,
      '## AirTrust coordinator V1 (read-only)\n' +
      '- Main: ' + sha + '\n' +
      '- Worker production: ' + (deployed || 'UNKNOWN') + '\n' +
      '- Open issues: ' + queue.issues.length + ', open PRs: ' + queue.prs.length + '\n' +
      '- AI executions: **0**; releases: **0**; GitHub API mutations: **0**.\n' +
      '- Evidence: sanitized JSON artifact. No autonomous dispatch enabled.\n');
  }
  console.log('AIRTRUST_ORCHESTRATOR_SNAPSHOT_OK issues=' + queue.issues.length +
    ' prs=' + queue.prs.length + ' main=' + sha + ' deployed=' + (deployed || 'UNKNOWN'));
  return snapshot;
}

if (process.argv[1]?.endsWith('airtrust-orchestrator-readonly.mjs')) {
  main().catch((error) => {
    console.error('AIRTRUST_ORCHESTRATOR_FAILED: ' + String(error.message || 'UNKNOWN'));
    process.exitCode = 1;
  });
}
