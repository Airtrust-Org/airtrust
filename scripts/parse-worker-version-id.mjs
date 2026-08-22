#!/usr/bin/env node

/**
 * Extracts the Worker Version ID from Wrangler output.
 *
 * Supports three known output formats:
 * - Wrangler 3.50+ `deploy`: "Worker Version ID: <uuid>" (single deployment;
 *   more than one distinct ID in the output is treated as ambiguous/suspicious).
 * - Wrangler 3.80+ `deploy`: "Version ID: <uuid>" (same, single deployment).
 * - `deployments list`: "Version(s):  (100%) <uuid>", one per historical
 *   deployment entry, oldest first. Multiple distinct IDs here are expected
 *   (it's a history, not a single deploy) — the most recent (last) one is
 *   the current deployment and is what callers want.
 */

import { readFileSync } from 'fs';

const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function extract(content) {
  const workerVersionMatch = content.match(new RegExp(`Worker Version ID:?\\s*${uuidRegex.source}`, 'i'));
  const versionMatch = content.match(new RegExp(`Version ID:?\\s*${uuidRegex.source}`, 'i'));

  const allWorkerVersionMatches = [...content.matchAll(new RegExp(`Worker Version ID:?\\s*${uuidRegex.source}`, 'gi'))];
  const allVersionMatches = [...content.matchAll(new RegExp(`(?<!\\()Version ID:?\\s*${uuidRegex.source}`, 'gi'))];
  const allVersionsListMatches = [...content.matchAll(new RegExp(`Version\\(s\\):\\s*(?:\\(\\d+%\\)\\s*)?${uuidRegex.source}`, 'gi'))];

  if (allVersionsListMatches.length > 0) {
    // `deployments list` history: take the most recent (last) entry.
    return allVersionsListMatches[allVersionsListMatches.length - 1][1];
  }

  const totalSingleDeployMatches = allWorkerVersionMatches.length + allVersionMatches.length;
  if (totalSingleDeployMatches === 0) {
    return null;
  }

  if (totalSingleDeployMatches > 1) {
    const allIds = new Set([
      ...allWorkerVersionMatches.map((m) => m[1].toLowerCase()),
      ...allVersionMatches.map((m) => m[1].toLowerCase()),
    ]);
    if (allIds.size > 1) {
      throw new Error('Ambiguous output: multiple different Worker Version IDs found');
    }
  }

  return workerVersionMatch ? workerVersionMatch[1] : versionMatch[1];
}

function main() {
  const logFile = process.argv[2];
  if (!logFile) {
    console.error('Usage: node parse-worker-version-id.mjs <log-file>');
    process.exit(1);
  }

  let content;
  try {
    content = readFileSync(logFile, 'utf8');
  } catch (error) {
    console.error(`Failed to read log file: ${error.message}`);
    process.exit(1);
  }

  let id;
  try {
    id = extract(content);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (!id) {
    console.error('No Worker Version ID found in deploy output.');
    process.exit(1);
  }

  console.log(id);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}

export function parseWorkerVersionId(content) {
  const id = extract(content);
  if (!id) {
    throw new Error('No Worker Version ID found');
  }
  return id;
}
