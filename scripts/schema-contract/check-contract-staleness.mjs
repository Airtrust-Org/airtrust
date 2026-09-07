#!/usr/bin/env node
/**
 * Lint gate: fail when the production schema contract is stale against the
 * Schema V2 changes present in the repository (HEALTH P1-07 / issue #485).
 *
 * Repo-only. Never touches a database. Runs in `npm run lint` and in
 * `build-content-gates`.
 *
 * Usage:
 *   node scripts/schema-contract/check-contract-staleness.mjs
 *   node scripts/schema-contract/check-contract-staleness.mjs --contract <path> --root <dir>
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { evaluateStaleness } from '../../src/schema-contract/contractStaleness.mjs';

const DEFAULT_CONTRACT = 'docs/database/schema-contracts/production-d1-baseline-v2.json';

function parseArgs(argv) {
  const out = { contract: DEFAULT_CONTRACT, root: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--contract') {
      out.contract = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--root') {
      out.root = argv[i + 1];
      i += 1;
    } else {
      console.error(`Argumento desconhecido: ${argv[i]}`);
      process.exit(2);
    }
  }
  return out;
}

function main() {
  const { contract: contractRel, root } = parseArgs(process.argv.slice(2));
  const contractPath = path.resolve(root, contractRel);

  let contract;
  try {
    contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  } catch (error) {
    console.error(`Nao foi possivel ler o contrato em ${contractPath}: ${error.message}`);
    process.exit(2);
  }

  const result = evaluateStaleness({ contract, rootDir: root });

  if (result.status === 'PASS') {
    const count = Array.isArray(contract.schema_v2_since_baseline)
      ? contract.schema_v2_since_baseline.length
      : 0;
    console.log(
      `schema-contract staleness OK: ${count} Schema V2 change(s) classificados; ` +
        `digest ${contract.staleness_guard?.schema_v2_digest ?? '(ausente)'} confere.`,
    );
    process.exit(0);
  }

  console.error('schema-contract staleness FAIL: contrato de schema obsoleto ou proveniencia invalida.\n');
  for (const issue of result.issues) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  console.error(
    '\nReconcilie docs/database/schema-contracts/production-d1-baseline-v2.json:\n' +
      '  1. adicione/atualize a entrada em schema_v2_since_baseline (change_file, sha256, targets, coverage, governance_state);\n' +
      '  2. se a mudanca toca uma tabela de scoped_tables, atualize tables{}/relevant_indexes/schema_hash e marque REFLECTED_IN_CONTRACT;\n' +
      '  3. atualize staleness_guard.schema_v2_digest (o valor calculado aparece na mensagem STALENESS_DIGEST_MISMATCH);\n' +
      '  4. veja docs/database/schema-contracts/README.md.',
  );
  process.exit(1);
}

main();
