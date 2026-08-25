#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {
  BackfillRefusedError,
  runBackfill,
} from './backfill-certificado-validacao-hash-remote.mjs';

const PRODUCTION_DB_NAME = 'airtrust-db';

function execProductionRemote({ databaseName, sql }) {
  if (databaseName !== PRODUCTION_DB_NAME) {
    throw new BackfillRefusedError(`PRODUCTION_DB_REJECTED:${databaseName}`);
  }
  const output = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', PRODUCTION_DB_NAME, '--env', 'production', '--remote', '--json', '--command', sql],
    {
      cwd: path.resolve(new URL('.', import.meta.url).pathname, '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const parsed = JSON.parse(output);
  return parsed?.[0]?.results ?? [];
}

function parseArgs(argv) {
  const args = { apply: false, recoveryPointConfirmed: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--recovery-point-confirmed') args.recoveryPointConfirmed = true;
    else if (arg.startsWith('--release-sha=')) args.releaseSha = arg.slice('--release-sha='.length);
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
    else if (arg.startsWith('--empresa-id=')) args.empresaId = arg.slice('--empresa-id='.length);
    else if (arg.startsWith('--batch-size=')) args.batchSize = Number(arg.slice('--batch-size='.length));
    else throw new BackfillRefusedError(`argumento não permitido no adaptador production: ${arg}`);
  }
  return args;
}

export async function runProductionBackfill(args) {
  return runBackfill({
    targetName: 'production',
    releaseSha: args.releaseSha,
    apply: Boolean(args.apply),
    confirm: args.confirm,
    empresaId: args.empresaId,
    batchSize: args.batchSize,
    recoveryPointConfirmed: Boolean(args.recoveryPointConfirmed),
    execRemote: execProductionRemote,
  });
}

async function main() {
  const result = await runProductionBackfill(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMainModule) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
