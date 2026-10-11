#!/usr/bin/env node
// Read-only audit of PR merge ancestry in the production Worker release.
// An ancestor SHA proves shipped source code, not functional acceptance or D1 state.
import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = 'Airtrust-Org/airtrust';
const API = 'https://api.github.com/repos/' + REPO;
const MAX_PRS = 80;

export function classifyReleaseComparison(status) {
  if (status === 'ahead' || status === 'identical') return 'CODE_IN_PRODUCTION';
  if (status === 'behind') return 'MERGED_NOT_DEPLOYED';
  return 'PROVENANCE_UNVERIFIED';
}

export function pagesEntryPrefix(html) {
  const found = String(html).match(/<script\b[^>]*\bsrc=["'][^"']*\/assets\/index-([^"']+)\.js["']/i);
  const sha = found?.[1]?.match(/-([0-9a-f]{7,12})-[A-Za-z0-9_-]+$/i);
  return sha ? sha[1].toLowerCase() : null;
}

export function pagesParity(prefix, workerSha) {
  if (!prefix || !/^[a-f0-9]{40}$/i.test(workerSha || '')) return 'UNVERIFIED';
  return workerSha.toLowerCase().startsWith(prefix) ? 'PREFIX_MATCH' : 'MISMATCH';
}

async function read(url, textResponse = false) {
  const headers = { Accept: textResponse ? 'text/html' :
    (url.startsWith('https://api.github.com/') ? 'application/vnd.github+json' : 'application/json') };
  if (url.startsWith('https://api.github.com/')) {
    headers['X-GitHub-Api-Version'] = '2022-11-28';
    if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('READONLY_HTTP_FAILURE ' + new URL(url).hostname + ' ' + response.status);
  return textResponse ? response.text() : response.json();
}

async function recentMergedPulls(cutoffMs) {
  const merged = [];
  let scanComplete = false;
  for (let page = 1; page <= 6; page++) {
    const batch = await read(API + '/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=' + page);
    for (const pr of batch) {
      if (pr.merged_at && Date.parse(pr.merged_at) >= cutoffMs) {
        merged.push({ number: pr.number, sha: pr.merge_commit_sha, mergedAt: pr.merged_at });
      }
    }
    if (batch.length < 100 || batch.every((pr) => Date.parse(pr.updated_at) < cutoffMs)) {
      scanComplete = true;
      break;
    }
  }
  merged.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
  return { prs: merged.slice(0, MAX_PRS), truncated: !scanComplete || merged.length > MAX_PRS };
}

async function classify(pr, deployedSha) {
  if (!/^[a-f0-9]{40}$/i.test(pr.sha || '')) {
    return { number: pr.number, status: 'PROVENANCE_UNVERIFIED' };
  }
  try {
    // PR merge SHA is the base; deployed SHA is the head.
    const compare = await read(API + '/compare/' + pr.sha + '...' + deployedSha);
    return { number: pr.number, status: classifyReleaseComparison(compare.status) };
  } catch {
    return { number: pr.number, status: 'PROVENANCE_UNVERIFIED' };
  }
}

export async function run() {
  const [version, html, mainBranch] = await Promise.all([
    read('https://api.airtrust.online/api/version'),
    read('https://airtrust.online/login', true),
    read(API + '/branches/main'),
  ]);
  const productionSha = version?.data?.sourceSha;
  const mainSha = mainBranch?.commit?.sha;
  if (!/^[a-f0-9]{40}$/i.test(productionSha || '') ||
      !/^[a-f0-9]{40}$/i.test(mainSha || '')) throw Error('SOURCE_SHA_UNKNOWN');

  const prefix = pagesEntryPrefix(html);
  const parity = pagesParity(prefix, productionSha);
  const mainDifference = await read(API + '/compare/' + productionSha + '...' + mainSha);
  const { prs, truncated } = await recentMergedPulls(Date.now() - 14 * 86400_000);
  const rows = [];
  for (let i = 0; i < prs.length; i += 6) {
    rows.push(...await Promise.all(prs.slice(i, i + 6).map((pr) => classify(pr, productionSha))));
  }
  const groups = Object.groupBy(rows, (row) => row.status);
  const unreleased = (groups.MERGED_NOT_DEPLOYED || []).map((x) => x.number);
  const uncertain = (groups.PROVENANCE_UNVERIFIED || []).map((x) => x.number);
  const summary = [
    '# AirTrust — read-only release coverage',
    '',
    '- main SHA: ' + mainSha,
    '- production Worker SHA: ' + productionSha,
    '- Pages entry SHA prefix: ' + (prefix || 'unknown'),
    '- Worker/Pages prefix parity: ' + parity,
    '- main against production: ' + mainDifference.status,
    '- merged PRs checked (14 days): ' + rows.length,
    '- code ancestry confirmed in production: ' + (groups.CODE_IN_PRODUCTION || []).length,
    '- merged PRs NOT in published source: ' + unreleased.length,
    '- PR ancestry unverified: ' + uncertain.length,
    '- truncated audit window: ' + truncated,
    '',
    '| PR | Code ancestry |',
    '| --- | --- |',
    ...rows.map(({ number, status }) =>
      '| [#' + number + '](https://github.com/' + REPO + '/pull/' + number + ') | ' + status + ' |'),
    '',
    'CAUTION: CODE_IN_PRODUCTION does not mean D1 migrations or functional acceptance were validated.',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n', 'utf8');
  }
  process.stdout.write(JSON.stringify({
    main_sha: mainSha, production_sha: productionSha, pages_sha_prefix: prefix,
    parity, main_relation: mainDifference.status,
    checked: rows.length, confirmed: (groups.CODE_IN_PRODUCTION || []).length,
    merged_not_deployed: unreleased, unverified: uncertain, truncated,
  }) + '\n');
  if (unreleased.length) process.stdout.write('::warning::Merged PRs absent from the production Worker commit history.\n');
  if (uncertain.length || truncated) process.stdout.write('::warning::Release audit incomplete or provenance unverified.\n');
  if (parity !== 'PREFIX_MATCH') throw Error('WORKER_PAGES_PREFIX_PARITY_' + parity);
  if (process.env.FAIL_ON_UNPUBLISHED === 'true' &&
      (unreleased.length || uncertain.length || truncated)) {
    throw Error('UNPUBLISHED_OR_UNVERIFIED_PRS');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--help')) {
    process.stdout.write('Read-only merge-vs-production SHA ancestry and Pages prefix check. Use FAIL_ON_UNPUBLISHED=true to fail closed.\n');
  } else run().catch((error) => {
    process.stderr.write('RELEASE_COVERAGE_AUDIT_FAILED ' + (error?.message || 'unknown') + '\n');
    process.exitCode = 1;
  });
}
