import path from 'node:path';
import { runSchemaContractCheck } from '../../src/schema-contract/checkSchemaContract.ts';

function usage(): never {
  console.error(
    [
      'Uso:',
      '  node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract <path> [--snapshot <path>]',
      '  node --experimental-strip-types scripts/schema-contract/check-schema-contract.ts --contract <path> --production [--db-name airtrust-db] [--env-name production]',
      'Exit codes: 0=PASS, 10=WARNING, 20=FAIL',
    ].join('\n'),
  );
  process.exit(30);
}

const args = process.argv.slice(2);
let contractPath = '';
let snapshotPath = '';
let production = false;
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

const rootDir = process.cwd();
const result = runSchemaContractCheck({
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
