#!/usr/bin/env node
// #2075: nenhum hash bcrypt completo pode ser versionado (evita reuso de hash de desenvolvimento em producao).
// Saida redigida: apenas path:linha, nunca o valor. Segredos de desenvolvimento entram por ambiente/placeholder.
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const BCRYPT_FULL = String.raw`\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}`;
const failures = [];
let out = '';
try {
  out = execFileSync(
    'git',
    ['grep', '-n', '-I', '-E', '-e', BCRYPT_FULL, '--', '.', ':(exclude)package-lock.json', ':(exclude)**/package-lock.json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
} catch (error) {
  if (error.status !== 1) failures.push(`scan failed (git grep exit ${error.status ?? 'unknown'})`);
}
for (const line of out.split('\n').filter(Boolean)) {
  const [path, lineNo] = line.split(':');
  failures.push(`${path}:${lineNo}: full bcrypt hash literal is forbidden [REDACTED]`);
}
if (failures.length) {
  console.error('[bcrypt-literals] FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('[bcrypt-literals] OK');
