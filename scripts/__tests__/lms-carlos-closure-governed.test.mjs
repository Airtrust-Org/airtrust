import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validateTarget, publicReport, performCanonicalCompletion } from '../production/lms-carlos-closure-governed.mjs';
const base = (id = 577, course = 23, total = 28) => ({
  id, curso_id: course, empresa_id: 6, funcionario_id: 82,
  tipo_conteudo: 'scorm', status: 'EM_ANDAMENTO', progresso_pct: 100,
  scorm_progresso: { lesson_status: 'incomplete', cmi_json: JSON.stringify({ 'cmi.core.lesson_location': `${total}/${total}` }) },
  closure_readiness: { code: 'PROGRESS_EVIDENCE_MISSING', last_step_reached: true,
    eligible_for_server_verification: false, missing: ['manifest_required_units', 'terminal_scorm_status'],
    slide_coverage: { total, recorded: total - 6 } },
});
test('scopes read-only preflight to exact named enrollment and course', () => {
  const x = validateTarget(base(), { id: 577, course: 23, total: 28 });
  assert.equal(x.already_completed, false);
  for (const update of [
    { id: 578 }, { empresa_id: 7 }, { curso_id: 55 }, { status: 'REPROVADO' },
    { progresso_pct: 99 }, { scorm_progresso: { lesson_status: 'passed', cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '28/28' }) } },
    { closure_readiness: { ...base().closure_readiness, last_step_reached: false } },
    { closure_readiness: { ...base().closure_readiness, missing: ['assessment_score'] } },
    { scorm_progresso: { lesson_status: 'incomplete', cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '27/28' }) } },
    { edition_mismatch: { required: true } },
  ]) assert.throws(() => validateTarget({ ...base(), ...update }, { id: 577, course: 23, total: 28 }), /CARLOS_CLOSURE_/);
});
test('SOP preflight validates exact 84/84 and preserves already concluded rows', () => {
  const s = validateTarget(base(703, 55, 84), { id: 703, course: 55, total: 84 });
  assert.equal(s.location, '84/84');
  const completed = base(703, 55, 84);
  completed.status = 'CONCLUIDO'; completed.data_conclusao = '2026-11-18';
  assert.equal(validateTarget(completed, { id: 703, course: 55, total: 84 }).already_completed, true);
});
test('sanitized report is stable, contains no CMI or employee/enrollment IDs', () => {
  const report = publicReport([validateTarget(base(), { id: 577, course: 23, total: 28 }),
    validateTarget(base(703, 55, 84), { id: 703, course: 55, total: 84 })], 0, 'dry-run');
  assert.deepEqual(report.target_courses, [23, 55]);
  assert.equal(report.writes, 0);
  assert.match(report.evidence_hash, /^[a-f0-9]{64}$/);
  assert.equal(report.personal_data, false);
  for (const row of report.rows) { assert.ok(!('id' in row)); assert.ok(!('funcionario_id' in row)); }
});

test('apply path sends complete administrative observations and verifies committed readback', async () => {
  const calls = [];
  const result = await performCanonicalCompletion({
    api: 'https://api.airtrust.online', token: 'synthetic', id: 703,
    observations: 'Reconciliacao administrativa aprovada pelo gerente',
    fetcher: async (url, opts) => {
      calls.push({url,opts}); return {status:200,json:{success:true}};
    },
    readEnrollment: async (token, id) => {
      assert.equal(token, 'synthetic'); assert.equal(id, 703);
      return {status:'CONCLUIDO', progresso_pct:100, data_conclusao:'2026-11-18'};
    },
  });
  assert.equal(result.status, 'CONCLUIDO');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/lms\/matriculas\/703\/status$/);
  assert.equal(calls[0].opts.method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0].opts.body), {
    status:'CONCLUIDO', observacoes:'Reconciliacao administrativa aprovada pelo gerente',
  });
  assert.match(calls[0].opts.headers.Authorization, /^Bearer synthetic$/);
});
test('apply refuses missing administrative reason, rejected PATCH and absent canonical readback', async () => {
  const core = { api:'https://api.airtrust.online', token:'synthetic', id:577,
    observations:'Reconciliacao administrativa de matricula 577',
    readEnrollment: async () => ({status:'EM_ANDAMENTO',progresso_pct:100}),
  };
  await assert.rejects(() => performCanonicalCompletion({...core, observations:''}), /REASON_MISSING/);
  await assert.rejects(() => performCanonicalCompletion({...core, fetcher:async()=>({status:409,json:{success:false}})}), /CANONICAL_API_REJECTED_409/);
  await assert.rejects(() => performCanonicalCompletion({...core, fetcher:async()=>({status:200,json:{success:true}})}), /POSTCHECK_FAILED/);
});
