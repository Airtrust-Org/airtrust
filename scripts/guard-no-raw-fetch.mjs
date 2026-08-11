import { spawnSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BASE_SHA = 'c3259a7967412c4a4219beba095f4b5515fb71b9';
const BASELINE_PATH = path.resolve('scripts/raw-fetch-baseline.json');
const FRONTEND_ROOT = path.resolve('src/react-app');

export const MIGRATED_MODULES = new Set([
  'src/react-app/components/licencas/ModalLicenca.tsx',
  'src/react-app/components/shared/BackupRestoreModal.tsx',
  'src/react-app/pages/BackupRestore.tsx',
  'src/react-app/pages/Configuracoes/Backup.tsx',
  'src/react-app/pages/Configuracoes/LimparDados.tsx',
  'src/react-app/pages/qualificacoes/LicencasTab.tsx',
  'src/react-app/services/agendamentos.service.ts',
  'src/react-app/services/funcionarios.service.ts',
  'src/services/agendamentos.service.ts',
  'src/services/funcionarios.service.ts',
]);

const AUTHORIZED_RAW_FETCH = new Set(['src/react-app/lib/apiFetch.ts']);
const AUTHORIZED_LOW_LEVEL_API_FETCH = new Set([
  'src/react-app/config/api.ts',
  'src/react-app/context/AuthContext.tsx',
  'src/react-app/lib/apiFetch.ts',
  'src/react-app/lib/app-fetch.ts',
  'src/react-app/services/http-client.ts',
  'src/react-app/utils/devAuth.ts',
]);

const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec)\./;
const RAW_FETCH = /(?<![\w.])fetch\s*\(|(?:window|globalThis)\.fetch\s*\(/g;
const LOW_LEVEL_API_FETCH = /(?<![\w.])apiFetch\s*\(/g;

function canonicalBaseline() {
  return {
    schemaVersion: 1,
    baseSha: BASE_SHA,
    mode: 'git-tree',
    counts: {},
  };
}

export function serializeBaseline(baseline = canonicalBaseline()) {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

export function assertBaselineIntegrity(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Baseline raw-fetch sem integridade: JSON inválido (${error.message}).`);
  }

  const expected = canonicalBaseline();
  const validKeys = Object.keys(expected);
  if (
    parsed?.schemaVersion !== expected.schemaVersion ||
    parsed?.baseSha !== expected.baseSha ||
    parsed?.mode !== expected.mode ||
    !parsed.counts ||
    typeof parsed.counts !== 'object' ||
    Array.isArray(parsed.counts) ||
    Object.keys(parsed.counts).length !== 0 ||
    Object.keys(parsed).sort().join('|') !== validKeys.sort().join('|') ||
    serializeBaseline(parsed) !== text
  ) {
    throw new Error(
      'Baseline raw-fetch sem integridade: deve ser o manifesto canônico vazio, vinculado ao SHA-base; tolerâncias são derivadas diretamente da árvore Git.',
    );
  }

  return parsed;
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} falhou: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout;
}

function ensureBaseCommit() {
  const check = spawnSync('git', ['cat-file', '-e', `${BASE_SHA}^{commit}`], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (check.status === 0) return;
  runGit(['fetch', '--no-tags', '--depth=1', 'origin', BASE_SHA]);
}

function countCalls(source) {
  const withoutLineComments = source.replace(/\/\/.*$/gm, '');
  return {
    rawFetch: (withoutLineComments.match(RAW_FETCH) || []).length,
    apiFetch: (withoutLineComments.match(LOW_LEVEL_API_FETCH) || []).length,
  };
}

function shouldScan(relativePath) {
  return (
    relativePath.startsWith('src/react-app/') &&
    SOURCE_EXTENSION.test(relativePath) &&
    !TEST_FILE.test(relativePath) &&
    !relativePath.includes('/__tests__/')
  );
}

async function scanCurrentTree() {
  const counts = {};

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') await walk(filePath);
        continue;
      }
      const relativePath = path.relative(process.cwd(), filePath).replaceAll(path.sep, '/');
      if (!shouldScan(relativePath)) continue;
      const value = countCalls(await readFile(filePath, 'utf8'));
      if (value.rawFetch || value.apiFetch) counts[relativePath] = value;
    }
  }

  await walk(FRONTEND_ROOT);
  return counts;
}

function scanBaseTree() {
  ensureBaseCommit();
  const paths = runGit(['ls-tree', '-r', '--name-only', BASE_SHA, '--', 'src/react-app'])
    .split('\n')
    .filter(Boolean)
    .filter(shouldScan)
    .sort();
  const counts = {};

  for (const relativePath of paths) {
    if (MIGRATED_MODULES.has(relativePath)) continue;
    const value = countCalls(runGit(['show', `${BASE_SHA}:${relativePath}`]));
    if (value.rawFetch || value.apiFetch) counts[relativePath] = value;
  }
  return counts;
}

function validateCounts(current, base) {
  const violations = [];

  for (const file of MIGRATED_MODULES) {
    const counts = current[file] || { rawFetch: 0, apiFetch: 0 };
    if (counts.rawFetch || counts.apiFetch) {
      violations.push(`${file}: módulo migrado deve usar somente o cliente autenticado canônico`);
    }
  }

  for (const [file, counts] of Object.entries(current)) {
    const previous = base[file] || { rawFetch: 0, apiFetch: 0 };
    if (!AUTHORIZED_RAW_FETCH.has(file) && counts.rawFetch > previous.rawFetch) {
      violations.push(`${file}: raw fetch aumentou ${previous.rawFetch} -> ${counts.rawFetch}`);
    }
    if (!AUTHORIZED_LOW_LEVEL_API_FETCH.has(file) && counts.apiFetch > previous.apiFetch) {
      violations.push(
        `${file}: apiFetch de baixo nível aumentou ${previous.apiFetch} -> ${counts.apiFetch}`,
      );
    }
  }

  if (violations.length) {
    throw new Error(`Regressão de raw fetch detectada:\n${violations.join('\n')}`);
  }
}

export async function runGuard() {
  const baselineText = await readFile(BASELINE_PATH, 'utf8');
  assertBaselineIntegrity(baselineText);
  const [current, base] = await Promise.all([scanCurrentTree(), Promise.resolve(scanBaseTree())]);
  validateCounts(current, base);
  console.log(
    `✅ Raw fetch sem regressão; baseline derivada deterministicamente de ${BASE_SHA} e módulos migrados fora da dívida tolerada.`,
  );
}

async function main() {
  if (process.argv.includes('--write-baseline')) {
    await writeFile(BASELINE_PATH, serializeBaseline(), 'utf8');
    console.log(`Baseline canônica regenerada para ${BASE_SHA}.`);
    return;
  }
  if (process.argv.includes('--print-baseline')) {
    process.stdout.write(serializeBaseline());
    return;
  }
  await runGuard();
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
