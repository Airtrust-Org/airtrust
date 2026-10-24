import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('legacy qualification CLI delegates directly to the existing canonical entrypoint', () => {
  const legacy = readFileSync(path.join(root, 'scripts/operacionais/compare-qualificacoes.ts'), 'utf8');
  const canonical = readFileSync(path.join(root, 'scripts/compare-qualificacoes.ts'), 'utf8');

  // The canonical source runs the comparison when loaded; a plain import
  // preserves that CLI behavior, unlike re-exporting or copying its source.
  assert.match(legacy, /^import '\.\.\/compare-qualificacoes';\s*$/m);
  assert.match(canonical, /compareQualificacoes\(\)\.catch\(console\.error\);/);
  assert.match(canonical, /new Database\(dbPath\)/);
  assert.match(canonical, /comparacao-qualificacoes-report\.json/);
  assert.doesNotMatch(legacy, /new Database|writeFileSync|csvData\s*=/);
  assert.ok(legacy.length < canonical.length / 4);
});
