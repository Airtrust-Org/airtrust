import test from 'node:test';
import assert from 'node:assert/strict';
import { patchJsSource, patchPackageDir } from '../scorm-storage-isolation/patch-package.mjs';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HELPER = '__scopeStorageKey__';

test('isola chave com literal simples (MCQ/SGSO/MOM app.js)', () => {
  const src = `(function(){
  "use strict";
  const data = window.COURSE || {};
  const STORE_KEY = "MNT_MCQ_MANUTENCAO_STATE_REVLMS_20260728";
  function loadLocal(){ const s = safeStorage(); const saved = parseJson(s.getItem(STORE_KEY) || "{}", {}); }
})();`;

  const { changed, matched, source } = patchJsSource(src, 'app.js');
  assert.equal(matched, true);
  assert.equal(changed, true);
  assert.ok(source.includes(HELPER));
  assert.match(source, /const STORE_KEY = __scopeStorageKey__\("MNT_MCQ_MANUTENCAO_STATE_REVLMS_20260728"\);/);
});

test('isola template literal (MEL app.js cacheKey)', () => {
  const src = `(function(){
  "use strict";
  const data = window.COURSE_DATA || {};
  const cacheKey = \`airtrust:\${data.id || "course"}:state\`;
  function loadState(){ return JSON.parse(localStorage.getItem(cacheKey) || "{}"); }
})();`;

  const { changed, source } = patchJsSource(src, 'app.js');
  assert.equal(changed, true);
  assert.match(source, /const cacheKey = __scopeStorageKey__\(`airtrust:\$\{data\.id \|\| "course"\}:state`\);/);
});

test('isola concatenação computada (MGM app.js)', () => {
  const src = `(function(){
  "use strict";
  const data = window.COURSE || {};
  const STORE_KEY = "AIRTRUST_" + String(data.storageKey || "mnt_mgm_manutencao_revlms_20260728").toUpperCase() + "_STATE";
  function persistLocal(){ s.setItem(STORE_KEY, JSON.stringify(state)); }
})();`;

  const { changed, source } = patchJsSource(src, 'app.js');
  assert.equal(changed, true);
  assert.match(source, /const STORE_KEY = __scopeStorageKey__\("AIRTRUST_" \+ String\(data\.storageKey \|\| "mnt_mgm_manutencao_revlms_20260728"\)\.toUpperCase\(\) \+ "_STATE"\);/);
});

test('isola concatenação multi-linha (HUMS-VXP app.js STORAGE_PREFIX)', () => {
  const src = `const STORAGE_PREFIX = 'ead_' + String((COURSE && (COURSE.short || COURSE.title)) || 'curso')
  .toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_') + '_revlms20260728_';
function storageGet(k, fallback){return localStorage.getItem(STORAGE_PREFIX+k);}`;

  const { changed, source } = patchJsSource(src, 'app.js');
  assert.equal(changed, true);
  assert.match(source, /const STORAGE_PREFIX = __scopeStorageKey__\('ead_' \+ String/);
  assert.ok(source.includes("+ '_revlms20260728_');"));
});

test('arquivo sem chave de storage (PT6C app.js) não é alterado', () => {
  const src = `(function(){
  "use strict";
  const data = window.COURSE_DATA;
  const slides = data.slides;
  function render(){}
})();`;

  const { changed, matched } = patchJsSource(src, 'app.js');
  assert.equal(matched, false);
  assert.equal(changed, false);
});

test('idempotente: arquivo já corrigido não é alterado de novo', () => {
  const src = `(function(){
  "use strict";
  const data = window.COURSE || {};
  function __scopeStorageKey__(base){ return base; }
  const STORE_KEY = __scopeStorageKey__("MNT_MCQ_MANUTENCAO_STATE_REVLMS_20260728");
})();`;

  const { changed, matched } = patchJsSource(src, 'app.js');
  assert.equal(matched, true);
  assert.equal(changed, false);
});

test('patchPackageDir corrige app.js e scorm_api.js e ignora demais arquivos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scorm-isolation-'));
  try {
    writeFileSync(
      join(dir, 'app.js'),
      'const STORE_KEY = "MNT_X_STATE";\nfunction load(){ return localStorage.getItem(STORE_KEY); }\n',
    );
    writeFileSync(
      join(dir, 'scorm_api.js'),
      '(function(){ var STORE_KEY = "MNT_X_SCORM12_STATE"; function load(){ return localStorage.getItem(STORE_KEY); } })();\n',
    );
    writeFileSync(join(dir, 'course_data.js'), 'window.COURSE = { slides: [] };\n');

    const results = patchPackageDir(dir);
    const byFile = Object.fromEntries(results.map((r) => [r.file, r]));

    assert.equal(byFile['app.js'].matched, true);
    assert.equal(byFile['app.js'].changed, true);
    assert.equal(byFile['scorm_api.js'].changed, true);
    assert.ok(readFileSync(join(dir, 'app.js'), 'utf8').includes(HELPER));
    assert.ok(readFileSync(join(dir, 'scorm_api.js'), 'utf8').includes(HELPER));
    // course_data.js não é tocado
    assert.equal(readFileSync(join(dir, 'course_data.js'), 'utf8'), 'window.COURSE = { slides: [] };\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('helper escopa por matricula/ciclo e cai em standalone sem identidade', () => {
  // Extrai o helper injetado e executa com window simulado.
  const src = 'const STORE_KEY = "X";';
  const { source } = patchJsSource(src, 'app.js');

  function runHelper(windowMock) {
    const fn = new Function(
      'window',
      `${source}; return __scopeStorageKey__("BASE");`,
    );
    return fn(windowMock);
  }

  // Mesmo navegador, matrícula 59, ciclo 3.
  assert.equal(
    runHelper({ parent: { MATRICULA_ID: 59, CICLO_ID: 3 } }),
    'BASE:m59:c3',
  );
  // Sem frame pai (standalone/preview).
  assert.equal(runHelper({ parent: null }), 'BASE:standalone');
  // Frame pai sem matrícula (preview).
  assert.equal(runHelper({ parent: { MATRICULA_ID: null, CICLO_ID: null } }), 'BASE:standalone');
  // Duas matrículas diferentes produzem chaves diferentes.
  assert.notEqual(
    runHelper({ parent: { MATRICULA_ID: 59, CICLO_ID: 3 } }),
    runHelper({ parent: { MATRICULA_ID: 60, CICLO_ID: 3 } }),
  );
});
