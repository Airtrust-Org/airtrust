import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const guard = resolve('scripts/guard-bcrypt-literals.mjs');

function sandbox(files) {
  const dir = mkdtempSync(join(tmpdir(), 'bcrypt-guard-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  return dir;
}

// Hash sintetico montado em runtime: o proprio teste nao versiona literal bcrypt.
const fakeHash = ['$2b', '10', 'a'.repeat(53)].join('$');

test('guard reprova hash bcrypt completo versionado sem imprimir o valor', () => {
  const dir = sandbox({ 'scripts/seed.sql': `UPDATE usuarios SET password_hash='${fakeHash}';\n` });
  try {
    const res = spawnSync('node', [guard], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(res.status, 0);
    const output = `${res.stdout}${res.stderr}`;
    assert.match(output, /scripts\/seed\.sql:1: full bcrypt hash literal is forbidden/);
    assert.ok(!output.includes(fakeHash));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('placeholder e hash truncado nao reprovam o scan de bcrypt', () => {
  const dir = sandbox({
    'scripts/seed.sql': "UPDATE usuarios SET password_hash='__AIRTRUST_LOCAL_BCRYPT_HASH__';\n-- formato $2b$10$...\n",
  });
  try {
    const res = spawnSync('node', [guard], { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
