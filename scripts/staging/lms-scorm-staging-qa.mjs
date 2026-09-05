#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';

import {
  assertAllowedStagingBaseUrl,
  extractAccessToken,
  fetchJson,
  login,
} from '../smoke-auth-common.mjs';

const API = assertAllowedStagingBaseUrl(
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev',
);
const STATE_PATH =
  process.env.QA_LMS_SCORM_STATE_PATH || 'qa-state/staging-lms-scorm/state.json';
const ROOT = path.dirname(STATE_PATH);
const MODE = process.argv.includes('--cleanup') ? 'cleanup' : 'prepare';
const RUN_MARKER = String(process.env.GITHUB_RUN_ID || Date.now());

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/\b[\w.+-]+@[\w.-]+\b/g, '[email]')
    .slice(0, 300);
}

async function authJson(token, route, options = {}) {
  return fetchJson(`${API}${route}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function qaToken() {
  const email = String(
    process.env.QA_EXAMINER_ADMIN_EMAIL ||
      process.env.QA_ADMIN_EMAIL ||
      'qa-examiner-admin@staging.airtrust.invalid',
  );
  const password = String(
    process.env.QA_EXAMINER_ADMIN_PASSWORD || process.env.QA_ADMIN_PASSWORD || '',
  );
  assert(password, 'QA_EXAMINER_ADMIN_PASSWORD ausente');

  const logged = await login(API, email, password);
  let token = extractAccessToken(logged);

  const empresas = await authJson(token, '/api/auth/empresas');
  assert(empresas.status === 200, `auth empresas retornou ${empresas.status}`);
  const list = Array.isArray(empresas.json?.data?.empresas) ? empresas.json.data.empresas : [];
  const qaCompany = list.find((item) => item?.codigo === 'qa_examiner_training');
  assert(qaCompany?.id, 'QA_EXAMINER_TENANT_NOT_AVAILABLE');

  const current = Number(empresas.json?.data?.empresaAtualId || 0);
  const target = Number(qaCompany.id);
  if (current !== target) {
    const switched = await authJson(token, '/api/auth/select-empresa', {
      method: 'POST',
      body: { empresaId: target },
    });
    assert(switched.status === 200, `select-empresa retornou ${switched.status}`);
    const next = String(switched.json?.data?.accessToken || '');
    assert(next, 'select-empresa não retornou accessToken');
    token = next;
  }

  const mine = await authJson(token, '/api/empresas/minha');
  assert(mine.status === 200, `empresa QA retornou ${mine.status}`);
  assert(Number(mine.json?.data?.id || 0) === target, 'token não está no tenant QA');
  return token;
}

function manifest(id) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}" version="1.0"
 xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
 xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <organizations default="ORG">
    <organization identifier="ORG">
      <title>AirTrust QA SCORM</title>
      <item identifier="ITEM" identifierref="RES"><title>QA</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;
}

function completionManifest(courseId) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      diagnosticsVersion: 'AIRTRUST_COMPLETION_DIAGNOSTICS_V1',
      scormVersion: '1.2',
      courseId,
      packageVersion: `qa-${RUN_MARKER}`,
      content: { requiredSlides: ['qa-slide-1'] },
      assessment: {
        requiredInteractions: ['qa-interaction-1'],
        masteryScore: 70,
        successStatus: 'passed',
        failureStatus: 'failed',
      },
      completion: { strategy: 'AIRTRUST_COMPLETION_CONTRACT_V1' },
      diagnostics: {
        currentSlide: true,
        slides: true,
        assessment: true,
        packageStatus: true,
        updatedAt: true,
      },
    },
    null,
    2,
  );
}

function successHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>AirTrust QA SCORM success</title></head>
<body>
<script>
(function () {
  var api = window.API;
  var finished = false;
  if (!api) throw new Error('SCORM API missing');
  api.LMSInitialize('');
  api.LMSSetValue('cmi.core.lesson_status', 'completed');
  api.LMSSetValue('cmi.core.score.raw', '100');
  api.LMSSetValue('cmi.core.lesson_location', '1/1');
  api.LMSCommit('');
  function finish() {
    if (finished) return;
    finished = true;
    api.LMSFinish('');
  }
  window.addEventListener('beforeunload', finish);
  window.addEventListener('pagehide', finish);
  window.addEventListener('unload', finish);
})();
</script>
<p>AirTrust synthetic SCORM QA success package.</p>
</body></html>`;
}

function timeoutHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>AirTrust QA SCORM timeout</title></head>
<body>
<script>
(function () {
  var api = window.API;
  var finished = false;
  if (!api) throw new Error('SCORM API missing');
  api.LMSInitialize('');
  api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
  api.LMSSetValue('cmi.core.lesson_location', '1/1');
  api.LMSCommit('');
  function finish() {
    if (finished) return;
    finished = true;
    api.LMSFinish('');
  }
  window.addEventListener('beforeunload', finish);
  window.addEventListener('pagehide', finish);
  window.addEventListener('unload', finish);
  function pulse() {
    fetch('./qa-heartbeat-' + Date.now()).catch(function () {});
    window.setTimeout(pulse, 100);
  }
  pulse();
})();
</script>
<p>AirTrust synthetic SCORM QA timeout package.</p>
</body></html>`;
}

function makeZip(kind) {
  const id = `AIRTRUST-QA-SCORM-${kind.toUpperCase()}-${RUN_MARKER}`;
  const files = {
    'imsmanifest.xml': strToU8(manifest(id)),
    'index.html': strToU8(kind === 'timeout' ? timeoutHtml() : successHtml()),
  };
  if (kind !== 'reject') {
    files['airtrust-completion-manifest.json'] = strToU8(completionManifest(id));
  }
  return zipSync(files, { level: 6 });
}

async function createCourse(token, key, label) {
  const title = `QA SCORM ${label} ${RUN_MARKER}`;
  const result = await authJson(token, '/api/lms/cursos', {
    method: 'POST',
    body: {
      titulo: title,
      descricao: 'Fixture sintético governado de QA SCORM em staging',
      categoria: 'QA Synthetic',
      carga_horaria_minutos: 1,
      tipo_conteudo: 'scorm',
      publicado: 0,
      scorm_mastery_score: 70,
      scorm_versao: '1.2',
    },
  });
  assert(
    result.status === 201,
    `create ${label} retornou ${result.status}: ${safeMessage(result.json?.error)}`,
  );
  const id = Number(result.json?.data?.id);
  assert(Number.isInteger(id) && id > 0, `create ${label} sem id`);
  const zipName = `qa-scorm-${key}-${RUN_MARKER}.zip`;
  const zipPath = path.join(ROOT, zipName);
  fs.writeFileSync(zipPath, makeZip(key), { mode: 0o600 });
  return { id, title, kind: key, zip_path: zipPath, zip_name: zipName };
}

async function prepare() {
  fs.mkdirSync(ROOT, { recursive: true });
  const token = await qaToken();
  const created = [];

  try {
    created.push(await createCourse(token, 'success', 'Success'));
    created.push(await createCourse(token, 'reject', 'Reject'));
    created.push(await createCourse(token, 'timeout', 'Timeout'));

    const state = {
      schema_version: 1,
      run_marker: RUN_MARKER,
      courses: Object.fromEntries(created.map((item) => [item.kind, item])),
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    console.log(
      JSON.stringify({
        ok: true,
        prepared: true,
        course_count: created.length,
        state_path: STATE_PATH,
        production_target_used: false,
      }),
    );
  } catch (error) {
    for (const item of [...created].reverse()) {
      await authJson(token, `/api/lms/cursos/${item.id}`, { method: 'DELETE' }).catch(() => null);
    }
    throw error;
  }
}

async function cleanup() {
  assert(fs.existsSync(STATE_PATH), 'state QA SCORM ausente para cleanup');
  const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const token = await qaToken();
  const results = [];

  for (const item of Object.values(state.courses || {})) {
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const removed = await authJson(token, `/api/lms/cursos/${id}`, { method: 'DELETE' });
    assert(
      removed.status === 200 || removed.status === 404,
      `cleanup curso ${id} retornou ${removed.status}`,
    );
    const verify = await authJson(token, `/api/lms/cursos/${id}`);
    assert(verify.status === 404, `curso sintético ${id} ainda visível após cleanup`);
    results.push({ kind: item.kind, removed: true });
  }

  const summary = {
    ok: true,
    cleanup: 'PASS',
    course_count: results.length,
    all_courses_unreachable: true,
    product_delete_endpoint_used: true,
    production_target_used: false,
  };
  const out = path.join(ROOT, 'cleanup-summary.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(summary));
}

(MODE === 'cleanup' ? cleanup() : prepare()).catch((error) => {
  console.error(
    `STAGING_LMS_SCORM_QA_${MODE.toUpperCase()}_FAILED: ${safeMessage(error?.message || error)}`,
  );
  process.exit(1);
});
