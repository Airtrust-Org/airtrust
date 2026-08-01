#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const SAFE_SHA = /^[0-9a-f]{40}$/;
const SAFE_HASH = /^[0-9a-f]{64}$/;
const SAFE_SQL_PATH = /^worker-airtrust\/schema-v2\/[A-Za-z0-9._/-]+\.sql$/;
const SAFE_PLAN_PATH = /^worker-airtrust\/schema-v2\/plans\/[A-Za-z0-9._/-]+\.(md|json)$/;

function fail(message) {
  throw new Error(message);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertSafeId(value, name) {
  if (!SAFE_ID.test(value)) fail(`${name} is invalid`);
}

function assertSafePath(value, pattern, name) {
  if (!pattern.test(value) || value.includes('..') || value.includes('//')) {
    fail(`${name} is invalid`);
  }
}

export function buildReviewedSchemaApply({
  manifestPath,
  outputPath,
  expectedChangeId,
  githubSha,
}) {
  assertSafeId(expectedChangeId, 'change_id');
  if (!SAFE_SHA.test(githubSha)) fail('github_sha is invalid');

  const manifestRaw = readFileSync(resolve(manifestPath));
  const manifest = JSON.parse(manifestRaw.toString('utf8'));
  const required = ['changeId', 'baselineId', 'filePath', 'fileHash', 'planPath', 'planHash'];
  for (const field of required) {
    if (typeof manifest[field] !== 'string' || manifest[field].length === 0) {
      fail(`manifest.${field} is required`);
    }
  }

  if (manifest.changeId !== expectedChangeId) fail('manifest changeId mismatch');
  assertSafeId(manifest.changeId, 'manifest.changeId');
  assertSafeId(manifest.baselineId, 'manifest.baselineId');
  assertSafePath(manifest.filePath, SAFE_SQL_PATH, 'manifest.filePath');
  assertSafePath(manifest.planPath, SAFE_PLAN_PATH, 'manifest.planPath');
  if (!SAFE_HASH.test(manifest.fileHash)) fail('manifest.fileHash is invalid');
  if (!SAFE_HASH.test(manifest.planHash)) fail('manifest.planHash is invalid');

  const sql = readFileSync(resolve(manifest.filePath));
  const plan = readFileSync(resolve(manifest.planPath));
  if (sha256(sql) !== manifest.fileHash) fail('schema SQL hash mismatch');
  if (sha256(plan) !== manifest.planHash) fail('reviewed plan hash mismatch');

  const sqlText = sql.toString('utf8').trimEnd();
  const ledgerSql = `\n\nINSERT INTO airtrust_schema_changes_v2\n  (change_id, baseline_id, file_path, file_hash, plan_hash, github_sha)\nVALUES\n  ('${manifest.changeId}', '${manifest.baselineId}', '${manifest.filePath}', '${manifest.fileHash}', '${manifest.planHash}', '${githubSha}');\n`;

  writeFileSync(resolve(outputPath), `${sqlText}${ledgerSql}`, { encoding: 'utf8', flag: 'wx' });
  return { ...manifest, manifestHash: sha256(manifestRaw), outputPath };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [manifestPath, outputPath, expectedChangeId, githubSha] = process.argv.slice(2);
  if (!manifestPath || !outputPath || !expectedChangeId || !githubSha) {
    fail('usage: build-reviewed-schema-apply.mjs <manifest> <output> <change_id> <github_sha>');
  }
  const result = buildReviewedSchemaApply({
    manifestPath,
    outputPath,
    expectedChangeId,
    githubSha,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
