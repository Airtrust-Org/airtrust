import path from 'node:path';
import {
  runSchemaContractCheck,
  runSchemaContractStalenessCheck,
} from '../../src/schema-contract/checkSchemaContract.ts';

function usage(): never {
  console.error(
    [
      'Uso:',
      '  node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract <path> [--snapshot <path>]',
      '  node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract <path> --production [--db-name airtrust-db] [--env-name production]',
      '  node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract <path> --staleness',
      '',
      'Modos:',
      '  --snapshot / --production : compara o contrato contra a estrutura real das tabelas escopadas.',
      '  --staleness              : verifica apenas proveniencia + obsolescencia contra a arvore do repo (sem DB).',
      '  (sem --staleness)        : os modos de snapshot/producao tambem executam a verificacao de staleness.',
      '',
      'Exit codes: 0=PASS, 10=WARNING, 20=FAIL',
    ].join('\n'),
  );
  process.exit(30);
}

const args = process.argv.slice(2);
let contractPath = '';
let snapshotPath = '';
let production = false;
let stalenessOnly = false;
let dbName = 'airtrust-db';
let envName = 'production';

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  switch (arg) {
    case '--contract':
      contractPath = args[index + 1] ?? '';
      index += 1;
      break;
    case '--snapshot':
      snapshotPath = args[index + 1] ?? '';
      index += 1;
      break;
    case '--production':
      production = true;
      break;
    case '--staleness':
      stalenessOnly = true;
      break;
    case '--db-name':
      dbName = args[index + 1] ?? dbName;
      index += 1;
      break;
    case '--env-name':
      envName = args[index + 1] ?? envName;
      index += 1;
      break;
    default:
      usage();
  }
}

if (!contractPath) {
  usage();
}

if (production && snapshotPath) {
  console.error('Nao combine --production com --snapshot.');
  process.exit(30);
}

if (stalenessOnly && (production || snapshotPath)) {
  console.error('Nao combine --staleness com --production/--snapshot.');
  process.exit(30);
}

const rootDir = process.cwd();
const result = stalenessOnly
  ? runSchemaContractStalenessCheck({
      contractPath: path.resolve(rootDir, contractPath),
      rootDir,
    })
  : runSchemaContractCheck({
      contractPath: path.resolve(rootDir, contractPath),
      snapshotPath: snapshotPath ? path.resolve(rootDir, snapshotPath) : undefined,
      production,
      rootDir,
      dbName,
      envName,
    });

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

if (result.status === 'PASS') {
  process.exit(0);
}

if (result.status === 'WARNING') {
  process.exit(10);
}

process.exit(20);
