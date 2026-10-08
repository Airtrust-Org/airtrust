import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { aggregateEnrollments, addAggregates, sanitizeCourse } from '../production/lms-course-completion-outcomes-readonly.mjs';

const ROOT = new URL('../../', import.meta.url);
const script = readFileSync(new URL('scripts/production/lms-course-completion-outcomes-readonly.mjs', ROOT), 'utf8');
const workflow = readFileSync(new URL('.github/workflows/production-lms-course-completion-outcomes-readonly.yml', ROOT), 'utf8');

test('aggregates real completion separately from false 99%-is-complete claim, without PII', () => {
  const privateRows = [
    { id: 101, funcionario_id: 55, funcionario_nome: 'Secret Name', email: 'private@example.org', status: 'CONCLUIDO', progresso_pct: 100, data_conclusao: '2026-10-01' },
    { id: 102, funcionario_id: 56, funcionario_nome: 'Secret 2', status: 'EM_ANDAMENTO', progresso_bruto: 100, progresso_efetivo: 99 },
    { id: 103, status: 'EM_ANDAMENTO', progresso_pct: 99 },
    { id: 104, status: 'EM_ANDAMENTO', progresso_pct: 97 },
    { id: 105, status: 'NAO_INICIADO', progresso_pct: 0 },
    { id: 106, status: 'CONCLUIDO', progresso_pct: 100 },
  ];
  const totals = aggregateEnrollments(privateRows);
  assert.deepEqual(totals, {
    matriculas: 6, concluidas: 2, sem_conclusao: 4,
    pendentes_99_ou_mais: 2, pendentes_100_bruto: 1,
    pendentes_95_a_98: 1, concluido_sem_data: 1,
  });
  const output = sanitizeCourse({ id: 55, titulo: 'Curso de exemplo', tipo_conteudo: 'scorm' }, totals);
  assert.equal(output.curso_id, 55);
  assert.equal(output.concluidas, 2);
  assert.equal(output.pendentes_99_ou_mais, 2);
  assert.doesNotMatch(JSON.stringify(output), /Secret|private@example|funcionario|id: 101/);
});

test('pagination fragments preserve counts and 99% semantics', () => {
  const a = aggregateEnrollments([{ status: 'CONCLUIDO', progresso_pct: 99 }, { status: 'EM_ANDAMENTO', progresso_pct: 100 }]);
  const b = aggregateEnrollments([{ status: 'EM_ANDAMENTO', progresso_pct: 99 }, { status: 'CANCELADO', progresso_pct: 50 }]);
  const combined = addAggregates(a, b);
  assert.equal(combined.matriculas, 4);
  assert.equal(combined.concluidas, 1);
  assert.equal(combined.pendentes_99_ou_mais, 2);
  assert.equal(combined.pendentes_100_bruto, 1);
});

test('production outcome audit has strict SHA, tenant, read-only scope, no learner payloads', () => {
  assert.match(script, /pinnedProduction/);
  assert.match(script, /PINNED_SHA/);
  assert.match(script, /COMPANY_ID === 6/);
  assert.match(script, /FULL_TENANT_ADMIN_SCOPE_REQUIRED/);
  assert.match(script, /\/api\/auth\/me/);
  assert.match(script, /\/api\/lms\/matriculas\/curso\//);
  assert.match(script, /COURSE_ENROLLMENTS_HTTP_/);
  assert.match(script, /ENROLLMENT_TOTAL_CHANGED_RETRY_REQUIRED/);
  assert.match(script, /Date\.now\(\) - issued >= 12 \* 60_000/);
  assert.match(script, /readOnlyGet/);
  assert.doesNotMatch(script, /api\/lms\/matriculas\/scorm\/commit/);
  assert.doesNotMatch(script, /wrangler\s+(?:d1|r2|deploy)/i);
  assert.doesNotMatch(script, /method:\s*['"](?:PUT|PATCH|DELETE)['"]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /secrets\.PROD_SMOKE_EMAIL/);
  assert.match(workflow, /secrets\.PROD_SMOKE_PASSWORD/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /\bpull_request:/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|d1|r2)/i);
});
