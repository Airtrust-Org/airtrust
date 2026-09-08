#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT_PATH = join(ROOT, 'scripts/ci/ci-schema-bootstrap-contract.json');

export function extractMigrationReferences(source) {
  return [...source.matchAll(/\$WORKER_DIR\/migrations\/([0-9][^"'\\s]+\.sql)/g)].map((m) => m[1]);
}

export function extractDdlTargets(sql) {
  const targets = new Set();
  const patterns = [
    /\b(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?)\s+["`]?([A-Za-z0-9_]+)/gi,
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?[A-Za-z0-9_]+["`]?\s+ON\s+["`]?([A-Za-z0-9_]+)/gi,
    /\bCREATE\s+TRIGGER(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?[A-Za-z0-9_]+["`]?[^;]*?\bON\s+["`]?([A-Za-z0-9_]+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of sql.matchAll(pattern)) targets.add(match[1]);
  }
  return [...targets];
}

export function schemaV2ChangesAfter(files, reviewedThrough) {
  const sqlFiles = files.filter((name) => /^\d{4}.*\.sql$/.test(name)).sort();
  const reviewedIndex = sqlFiles.indexOf(reviewedThrough);
  if (reviewedIndex < 0) throw new Error(`reviewed Schema V2 change not found: ${reviewedThrough}`);
  return sqlFiles.slice(reviewedIndex + 1);
}

export function validateContract(root = ROOT) {
  const contract = JSON.parse(readFileSync(join(root, 'scripts/ci/ci-schema-bootstrap-contract.json'), 'utf8'));
  const bootstrapPath = join(root, contract.bootstrap_script);
  const baseSchemaPath = join(root, contract.base_schema);
  if (!existsSync(bootstrapPath)) throw new Error(`bootstrap script missing: ${contract.bootstrap_script}`);
  if (!existsSync(baseSchemaPath)) throw new Error(`base schema missing: ${contract.base_schema}`);

  const bootstrap = readFileSync(bootstrapPath, 'utf8');
  if (!bootstrap.includes('source_reference: scripts/schema-local.sql')) {
    throw new Error('bootstrap must declare its versioned base-schema provenance');
  }
  if (!bootstrap.includes('--local')) throw new Error('bootstrap must remain local-only');
  if (/--remote|airtrust-db-production|airtrust-db-staging/.test(bootstrap)) {
    throw new Error('CI bootstrap must not reference remote D1 targets');
  }

  const migrations = extractMigrationReferences(bootstrap);
  if (migrations.length === 0) throw new Error('bootstrap migration list is empty');
  const duplicateMigrations = migrations.filter((name, index) => migrations.indexOf(name) !== index);
  if (duplicateMigrations.length) throw new Error(`duplicate bootstrap migrations: ${[...new Set(duplicateMigrations)].join(', ')}`);
  for (const migration of migrations) {
    if (!existsSync(join(root, 'worker-airtrust/migrations', migration))) {
      throw new Error(`bootstrap references missing migration: ${migration}`);
    }
  }

  for (const consumer of contract.official_consumers) {
    const consumerPath = join(root, consumer);
    if (!existsSync(consumerPath)) throw new Error(`official CI consumer missing: ${consumer}`);
    const source = readFileSync(consumerPath, 'utf8');
    if (!source.includes(contract.canonical_bootstrap_command)) {
      throw new Error(`${consumer} must use canonical bootstrap command: ${contract.canonical_bootstrap_command}`);
    }
    if (/wrangler\s+d1\s+(?:migrations\s+apply|execute).*--remote/.test(source)) {
      throw new Error(`${consumer} contains remote D1 schema mutation in CI bootstrap path`);
    }
  }

  const changesDir = join(root, 'worker-airtrust/schema-v2/changes');
  const changes = schemaV2ChangesAfter(readdirSync(changesDir), contract.reviewed_through_schema_v2_change);
  const critical = new Set(contract.critical_tables);
  const stale = [];
  for (const change of changes) {
    const sql = readFileSync(join(changesDir, change), 'utf8');
    const touched = extractDdlTargets(sql).filter((table) => critical.has(table));
    if (touched.length) stale.push({ change, tables: touched });
  }
  if (stale.length) {
    throw new Error(
      'CI schema bootstrap contract is stale; newer Schema V2 changes touch critical tables: ' +
        stale.map((x) => `${x.change}=>${x.tables.join(',')}`).join('; '),
    );
  }

  return { migrations: migrations.length, consumers: contract.official_consumers.length, newerSchemaV2Changes: changes.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = validateContract();
    console.log(`CI_SCHEMA_BOOTSTRAP_CONTRACT=PASS migrations=${result.migrations} consumers=${result.consumers} newer_schema_v2=${result.newerSchemaV2Changes}`);
  } catch (error) {
    console.error(`CI_SCHEMA_BOOTSTRAP_CONTRACT=FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
