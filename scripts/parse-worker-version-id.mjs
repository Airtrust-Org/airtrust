#!/usr/bin/env node

/**
 * Extracts the Worker Version ID from Wrangler deploy output.
 * 
 * Supports both known output formats:
 * - Wrangler 3.50+: "Worker Version ID: <uuid>"
 * - Wrangler 3.80+: "Version ID: <uuid>"
 */

import { readFileSync } from 'fs';

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

  // Look for both "Worker Version ID: <uuid>" and "Version ID: <uuid>"
  // We use a strict UUID regex to avoid matching random other IDs.
  const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  
  const workerVersionMatch = content.match(new RegExp(`Worker Version ID:?\\s*${uuidRegex.source}`, 'i'));
  const versionMatch = content.match(new RegExp(`Version ID:?\\s*${uuidRegex.source}`, 'i'));

  // Get all matches to check for ambiguity
  const allWorkerVersionMatches = [...content.matchAll(new RegExp(`Worker Version ID:?\\s*${uuidRegex.source}`, 'gi'))];
  const allVersionMatches = [...content.matchAll(new RegExp(`Version ID:?\\s*${uuidRegex.source}`, 'gi'))];

  const totalMatches = allWorkerVersionMatches.length + allVersionMatches.length;

  if (totalMatches === 0) {
    console.error('No Worker Version ID found in deploy output.');
    process.exit(1);
  }

  if (totalMatches > 1) {
    // If the same exact ID appears multiple times, it might just be Wrangler repeating itself in verbose logs
    const allIds = new Set([
      ...allWorkerVersionMatches.map(m => m[1].toLowerCase()),
      ...allVersionMatches.map(m => m[1].toLowerCase())
    ]);
    
    if (allIds.size > 1) {
      console.error('Ambiguous output: multiple different Worker Version IDs found.');
      process.exit(1);
    }
  }

  const id = workerVersionMatch ? workerVersionMatch[1] : versionMatch[1];
  console.log(id);
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}

export function parseWorkerVersionId(content) {
  const uuidRegex = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  const workerVersionMatch = content.match(new RegExp(`Worker Version ID:?\\s*${uuidRegex.source}`, 'i'));
  const versionMatch = content.match(new RegExp(`Version ID:?\\s*${uuidRegex.source}`, 'i'));

  const allWorkerVersionMatches = [...content.matchAll(new RegExp(`Worker Version ID:?\\s*${uuidRegex.source}`, 'gi'))];
  const allVersionMatches = [...content.matchAll(new RegExp(`Version ID:?\\s*${uuidRegex.source}`, 'gi'))];

  const totalMatches = allWorkerVersionMatches.length + allVersionMatches.length;

  if (totalMatches === 0) {
    throw new Error('No Worker Version ID found');
  }

  const allIds = new Set([
    ...allWorkerVersionMatches.map(m => m[1].toLowerCase()),
    ...allVersionMatches.map(m => m[1].toLowerCase())
  ]);

  if (allIds.size > 1) {
    throw new Error('Ambiguous output: multiple different Worker Version IDs found');
  }

  return workerVersionMatch ? workerVersionMatch[1] : versionMatch[1];
}
