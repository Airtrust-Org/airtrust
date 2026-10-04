import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  assertReadOnlyApiRequest,
  sanitizeCourse,
  targetTagsForCourse,
} from '../production/lms-catalog-readonly-inventory.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const WORKFLOW = '.github/workflows/production-lms-catalog-readonly-inventory.yml';
const SCRIPT = 'scripts/production/lms-catalog-readonly-inventory.mjs';

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.push(key);
    collectKeys(nested, keys);
  }
  return keys;
}

test('LMS requests are GET-only; only auth tenant selection may POST', () => {
  assert.equal(assertReadOnlyApiRequest('GET', '/api/lms/cursos'), true);
  assert.equal(assertReadOnlyApiRequest('GET', '/api/lms/cursos/123'), true);
  assert.equal(assertReadOnlyApiRequest('POST', '/api/auth/select-empresa'), true);
  assert.throws(() => assertReadOnlyApiRequest('POST', '/api/lms/cursos'), /LMS_WRITE_BLOCKED/);
  assert.throws(() => assertReadOnlyApiRequest('PUT', '/api/lms/cursos/1'), /LMS_WRITE_BLOCKED/);
  assert.throws(() => assertReadOnlyApiRequest('DELETE', '/api/lms/cursos/1'), /LMS_WRITE_BLOCKED/);
  assert.throws(() => assertReadOnlyApiRequest('POST', '/api/qualificacoes/tipos'), /NON_READONLY_ROUTE_BLOCKED/);
});

test('course sanitizer emits only non-PII metadata and reduces storage data to booleans', () => {
  const sanitized = sanitizeCourse({
    id: 42,
    titulo: 'NR-20 Intermediário',
    tipo_conteudo: 'scorm',
    ativo: 1,
    publicado: 1,
    scorm_versao: '1.2',
    scorm_package_r2_prefix: 'lms/scorm/6/42/secret-ish-prefix',
    scorm_launch_file: 'index.html',
    version_tag: 'rc1',
    qualificacao_tipo_id: 99,
    qualificacao_tipo_nome: 'NR-20',
    qualificacao_tipo_codigo: 'NR-20',
    gerar_qualificacao_ao_concluir: 1,
    total_matriculas: 100,
    total_concluidos: 80,
    funcionario_id: 123,
    email: 'person@example.com',
    token: 'secret',
  });
  assert.equal(sanitized.has_scorm_package, true);
  assert.equal(sanitized.has_scorm_launch, true);
  assert.deepEqual(sanitized.target_tags, ['NR20']);
  const keys = collectKeys(sanitized).map((key) => key.toLowerCase());
  for (const forbidden of ['r2_prefix', 'total_matriculas', 'total_concluidos', 'funcionario_id', 'email', 'token', 'password']) {
    assert.equal(keys.some((key) => key.includes(forbidden)), false, `forbidden key leaked: ${forbidden}`);
  }
  assert.equal(JSON.stringify(sanitized).includes('secret-ish-prefix'), false);
  assert.equal(JSON.stringify(sanitized).includes('person@example.com'), false);
});

test('V4 target matcher recognizes planned corporate EAD themes', () => {
  assert.deepEqual(targetTagsForCourse({ titulo: 'Produtos Químicos e FDS' }), ['NR26_FDS']);
  assert.deepEqual(targetTagsForCourse({ titulo: 'Cultura Justa' }), ['CULTURA_JUSTA']);
  assert.deepEqual(targetTagsForCourse({ titulo: 'STOP WORK' }), ['STOP_WORK']);
  assert.deepEqual(targetTagsForCourse({ titulo: 'Código de Ética e Conduta' }), ['ETICA_CONDUTA']);
  assert.deepEqual(targetTagsForCourse({ titulo: 'LGPD e Proteção de Dados' }), ['LGPD']);
  assert.deepEqual(targetTagsForCourse({ titulo: 'CRM Corporativo' }), ['CRM']);
});

test('workflow is production read-only, SHA-pinned and online-triggerable', () => {
  const workflow = read(WORKFLOW);
  const script = read(SCRIPT);
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\n\s*- created/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_LMS_CATALOG_INVENTORY_READONLY/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /https:\/\/api\.airtrust\.online\/api\/version/);
  assert.match(workflow, /production-lms-catalog-readonly-inventory\.mjs/);
  assert.match(script, /assertAllowedProductionBaseUrl/);
  assert.match(script, /TARGET_COMPANY_ID \|\| 6/);
  assert.match(script, /LMS_WRITE_BLOCKED/);
  assert.doesNotMatch(workflow, /wrangler\s+d1\s+execute/i);
  assert.doesNotMatch(workflow, /deploy-airtrust|wrangler\s+deploy|pages\s+deploy/i);
  assert.doesNotMatch(workflow, /CLOUDFLARE_D1_MIGRATION_API_TOKEN/);
  assert.doesNotMatch(script, /lms_matriculas|funcionarios|certificados/i);
});
