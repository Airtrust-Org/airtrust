#!/usr/bin/env node
// Read-only audit of PR merge ancestry in the production Worker release.
// An ancestor SHA proves shipped source code, not functional acceptance or D1 state.
import { appendFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO = 'Airtrust-Org/airtrust';
const API = 'https://api.github.com/repos/' + REPO;
const AUDIT_SCOPES = Object.freeze({
  recent: { windowDays: 14, maxPrs: 80, maxPages: 6 },
  historical: { windowDays: 365, maxPrs: 300, maxPages: 25 },
  'historical-batch': { windowDays: 365, maxPrs: 2500, maxPages: 25 },
});

export function auditScopeOptions(scope = 'recent') {
  if (!Object.hasOwn(AUDIT_SCOPES, scope)) throw Error('INVALID_RELEASE_AUDIT_SCOPE');
  return { scope, ...AUDIT_SCOPES[scope] };
}

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

export async function recentMergedPulls(cutoffMs, {
  maxPrs = 80,
  maxPages = 6,
  fetchPage = (page) => read(API + '/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=' + page),
} = {}) {
  if (!Number.isFinite(cutoffMs) || !Number.isInteger(maxPrs) || maxPrs < 1 ||
      !Number.isInteger(maxPages) || maxPages < 1) throw Error('INVALID_AUDIT_SCAN_LIMITS');
  const merged = [];
  let scanComplete = false;
  let pagesScanned = 0;
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchPage(page);
    if (!Array.isArray(batch) || batch.length > 100) throw Error('INVALID_GITHUB_PULL_PAGE');
    pagesScanned++;
    for (const pr of batch) {
      if (pr.merged_at && Date.parse(pr.merged_at) >= cutoffMs) {
        merged.push({ number: pr.number, sha: pr.merge_commit_sha, mergedAt: pr.merged_at });
      }
    }
    // GitHub returns "updated desc", so later pages cannot be newer than the
    // oldest row in this page. Never use merge date as the pagination order.
    const oldestUpdate = Date.parse(batch[batch.length - 1]?.updated_at ?? '');
    if (batch.length < 100 || (Number.isFinite(oldestUpdate) && oldestUpdate < cutoffMs)) {
      scanComplete = true;
      break;
    }
    if (merged.length > maxPrs) break;
  }
  merged.sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));
  const capped = merged.length > maxPrs;
  return {
    prs: merged.slice(0, maxPrs),
    truncated: !scanComplete || capped,
    pagesScanned, matchesFound: merged.length,
    limitReason: capped ? 'MAX_PRS' : (!scanComplete ? 'MAX_SCAN_PAGES' : null),
  };
}

const HISTORY_BATCH_SIZE = 80;
const HISTORY_RATE_RESERVE = 120;

export function historicalBatchInput(anchorUtc, rawOffset) {
  if (typeof anchorUtc !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(anchorUtc)) {
    throw Error('HISTORICAL_BATCH_ANCHOR_REQUIRED');
  }
  const anchorMs = Date.parse(anchorUtc);
  if (!Number.isFinite(anchorMs) || new Date(anchorMs).toISOString().replace('.000Z', 'Z') !== anchorUtc ||
      anchorMs > Date.now()) throw Error('HISTORICAL_BATCH_ANCHOR_INVALID');
  if (!/^(0|[1-9]\d{0,3})$/.test(String(rawOffset ?? ''))) {
    throw Error('HISTORICAL_BATCH_OFFSET_INVALID');
  }
  const offset = Number(rawOffset);
  if (offset > 2500) throw Error('HISTORICAL_BATCH_OFFSET_OUT_OF_RANGE');
  return { anchorUtc, anchorMs, offset };
}

export function selectHistoricalBatch(scan, input, batchSize = HISTORY_BATCH_SIZE) {
  // Only complete inventory scans can be sliced into durable cursor ranges.
  // Merge timestamps are immutable; the fixed upper and lower date anchors
  // exclude later merges between separate workflow runs.
  if (scan.truncated) throw Error('HISTORICAL_INVENTORY_TRUNCATED');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 80) {
    throw Error('HISTORICAL_BATCH_SIZE_INVALID');
  }
  const eligible = scan.prs.filter((pr) =>
    Number.isFinite(Date.parse(pr.mergedAt)) && Date.parse(pr.mergedAt) <= input.anchorMs);
  if (input.offset > eligible.length) throw Error('HISTORICAL_BATCH_OFFSET_OUT_OF_RANGE');
  const prs = eligible.slice(input.offset, input.offset + batchSize);
  const nextOffset = input.offset + prs.length < eligible.length
    ? input.offset + prs.length : null;
  return {
    prs, truncated: nextOffset !== null,
    pagesScanned: scan.pagesScanned, matchesFound: eligible.length,
    limitReason: nextOffset === null ? null : 'NEXT_BATCH',
    nextOffset, batchOffset: input.offset, anchorUtc: input.anchorUtc,
    inventoryComplete: true,
  };
}

export function checkGithubRateBudget(remaining, count) {
  const required = count * 5 + HISTORY_RATE_RESERVE; // compare + at most four changed-file pages
  if (!Number.isInteger(remaining) || remaining < required) {
    throw Error('GITHUB_CORE_RATE_BUDGET_INSUFFICIENT');
  }
  return { remaining, required, reserve: HISTORY_RATE_RESERVE };
}

export function classifyChangeSurfaces(files) {
  if (!Array.isArray(files) || !files.length) return ['UNKNOWN'];
  const surfaces = new Set();
  for (const file of files) {
    const name = typeof file === 'string' ? file : file?.filename;
    if (!name || typeof name !== 'string') { surfaces.add('UNKNOWN'); continue; }
    if (/^worker-airtrust\/schema-v2\//.test(name)) surfaces.add('SCHEMA_V2');
    else if (/^(?:src|worker-airtrust\/src)\/(?:__tests__\/|.*(?:\/__tests__\/|\.test\.|\.spec\.))/.test(name) ||
             /^scripts\/__tests__\//.test(name)) surfaces.add('CI_OPS');
    else if (/^worker-airtrust\/src\//.test(name) || /^worker-airtrust\/(?:wrangler|package)/.test(name)) surfaces.add('WORKER');
    else if (/^(?:src\/|public\/|index\.html$|vite\.config\.)/.test(name)) surfaces.add('PAGES');
    else if (/^(?:package(?:-lock)?\.json$)/.test(name)) {
      surfaces.add('WORKER'); surfaces.add('PAGES');
    } else if (/^(?:\.github\/|scripts\/|docs\/|worker-airtrust\/src\/__tests__\/|README|AGENTS\.md$)/.test(name)) {
      surfaces.add('CI_OPS');
    } else surfaces.add('UNKNOWN');
  }
  return [...surfaces].sort();
}

async function changedSurfaces(number) {
  const files = [];
  for (let page = 1; page <= 4; page++) {
    const batch = await read(API + '/pulls/' + number + '/files?per_page=100&page=' + page);
    if (!Array.isArray(batch) || batch.length > 100) return ['UNKNOWN'];
    files.push(...batch);
    if (batch.length < 100) return classifyChangeSurfaces(files);
  }
  // Cannot classify when changed-file pagination itself was truncated.
  return ['UNKNOWN'];
}

async function classify(pr, deployedSha) {
  const [comparison, changedFiles] = await Promise.allSettled([
    /^[a-f0-9]{40}$/i.test(pr.sha || '')
      ? read(API + '/compare/' + pr.sha + '...' + deployedSha)
      : Promise.reject(Error('MERGE_SHA_UNAVAILABLE')),
    changedSurfaces(pr.number),
  ]);
  return {
    number: pr.number,
    status: comparison.status === 'fulfilled'
      ? classifyReleaseComparison(comparison.value.status)
      : 'PROVENANCE_UNVERIFIED',
    surfaces: changedFiles.status === 'fulfilled' ? changedFiles.value : ['UNKNOWN'],
  };
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
  const audit = auditScopeOptions(process.env.RELEASE_AUDIT_SCOPE || 'recent');
  const isBatch = audit.scope === 'historical-batch';
  const input = isBatch ? historicalBatchInput(
    process.env.RELEASE_AUDIT_ANCHOR_UTC,
    process.env.RELEASE_AUDIT_BATCH_OFFSET,
  ) : null;
  const scan = await recentMergedPulls(
    (input?.anchorMs ?? Date.now()) - audit.windowDays * 86400_000,
    audit,
  );
  const selection = isBatch ? selectHistoricalBatch(scan, input) : scan;
  const { prs, truncated, pagesScanned, matchesFound, limitReason } = selection;
  // A job token typically has 1,000 core calls/hour; reserve the maximum
  // possible count of comparison and changed-file requests BEFORE processing.
  const rateBudget = isBatch
    ? checkGithubRateBudget((await read('https://api.github.com/rate_limit'))?.resources?.core?.remaining, prs.length)
    : null;
  const openPulls = await read(API + '/pulls?state=open&sort=updated&direction=desc&per_page=100');
  const openNumbers = openPulls.map((pr) => pr.number);
  const rows = [];
  for (let i = 0; i < prs.length; i += 6) {
    rows.push(...await Promise.all(prs.slice(i, i + 6).map((pr) => classify(pr, productionSha))));
  }
  const groups = Object.groupBy(rows, (row) => row.status);
  const unreleased = (groups.MERGED_NOT_DEPLOYED || []).map((x) => x.number);
  const uncertain = (groups.PROVENANCE_UNVERIFIED || []).map((x) => x.number);
  const unknownSurfaces = rows.filter((x) => x.surfaces.includes('UNKNOWN')).map((x) => x.number);
  const bySurface = (surface) => rows.filter((x) => x.surfaces.includes(surface)).map((x) => x.number);
  const summary = [
    '# AirTrust — read-only release coverage',
    '',
    '- main SHA: ' + mainSha,
    '- production Worker SHA: ' + productionSha,
    '- Pages entry SHA prefix: ' + (prefix || 'unknown'),
    '- Worker/Pages prefix parity: ' + parity,
    '- main against production: ' + mainDifference.status,
    '- open PRs (not merged; never treat as released): ' + openNumbers.length,
    '- open PR pagination possibly incomplete: ' + (openNumbers.length === 100),
    '- audit scope / window: ' + audit.scope + ' / ' + audit.windowDays + ' days',
    '- scan pages / matching PRs before cap: ' + pagesScanned + ' / ' + matchesFound,
    '- checked PR cap / scan page cap: ' + audit.maxPrs + ' / ' + audit.maxPages,
    '- truncation reason: ' + (limitReason || 'none'),
    ...(isBatch ? [
      '- immutable merge-date upper anchor UTC: ' + input.anchorUtc,
      '- batch offset / next offset: ' + input.offset + ' / ' + (selection.nextOffset ?? 'COMPLETE'),
      '- candidate inventory complete: ' + selection.inventoryComplete,
      '- checked batch size / total candidates: ' + prs.length + ' / ' + matchesFound,
      '- GitHub core budget remaining / reserved request estimate: ' + rateBudget.remaining + ' / ' + rateBudget.required,
      '- pagination safety: merge-date anchored; complete candidate inventory rescanned for each batch',
    ] : []),
    '- merged PRs checked: ' + rows.length,
    '- code ancestry confirmed in production: ' + (groups.CODE_IN_PRODUCTION || []).length,
    '- merged PRs NOT in published source: ' + unreleased.length,
    '- PR ancestry unverified: ' + uncertain.length,
    '- changed-file surface unverified: ' + unknownSurfaces.length,
    '- NOTE: SCHEMA_V2 means migration file merged, NOT applied to D1.',
    '- truncated audit window: ' + truncated,
    '- open PR numbers: ' + openNumbers.map((n) => '#' + n).join(', '),
    '',
    '| PR | Source ancestry | Changed-file surfaces (heuristic, not release proof) |',
    '| --- | --- | --- |',
    ...rows.map(({ number, status, surfaces }) =>
      '| [#' + number + '](https://github.com/' + REPO + '/pull/' + number + ') | ' + status + ' | ' + surfaces.join(', ') + ' |'),
    '',
    'CAUTION: CODE_IN_PRODUCTION does not mean D1 migrations or functional acceptance were validated.',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary + '\n', 'utf8');
  }
  const result = {
    main_sha: mainSha, production_sha: productionSha, pages_sha_prefix: prefix,
    parity, main_relation: mainDifference.status,
    open_not_merged: openNumbers, open_scan_truncated: openNumbers.length === 100,
    checked: rows.length, confirmed: (groups.CODE_IN_PRODUCTION || []).length,
    merged_not_deployed: unreleased, unverified: uncertain, truncated,
    scope: audit.scope, window_days: audit.windowDays, pages_scanned: pagesScanned,
    matches_found: matchesFound, max_prs: audit.maxPrs, max_scan_pages: audit.maxPages,
    truncation_reason: limitReason, unknown_surface: unknownSurfaces,
    worker_changed_prs: bySurface('WORKER'), pages_changed_prs: bySurface('PAGES'),
    schema_v2_changed_prs: bySurface('SCHEMA_V2'),
    ...(isBatch ? { anchor_utc: input.anchorUtc, batch_offset: input.offset,
      next_offset: selection.nextOffset, inventory_complete: selection.inventoryComplete,
      rate_budget: rateBudget } : {}),
  };
  if (isBatch && process.env.RELEASE_AUDIT_ARTIFACT) {
    await writeFile(process.env.RELEASE_AUDIT_ARTIFACT, JSON.stringify({
      ...result, pr_rows: rows,
    }, null, 2) + '\n', 'utf8');
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  if (unreleased.length) process.stdout.write('::warning::Merged PRs absent from the production Worker commit history.\n');
  if (uncertain.length || truncated || unknownSurfaces.length) process.stdout.write('::warning::Release audit incomplete, surface unknown or provenance unverified.\n');
  if (parity !== 'PREFIX_MATCH') throw Error('WORKER_PAGES_PREFIX_PARITY_' + parity);
  if (process.env.FAIL_ON_UNPUBLISHED === 'true' &&
      (unreleased.length || uncertain.length || truncated || unknownSurfaces.length)) {
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
