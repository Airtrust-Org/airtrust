import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(
  new URL('../../docs/lms/native-v3-course-inventory-20261020.json', import.meta.url), 'utf8'
));

test('Native V3 catalog is private-content metadata, not a publishing grant', () => {
  assert.equal(catalog.status, 'REVIEW_ONLY_NOT_PUBLISHABLE');
  assert.equal(catalog.productionWritesPerformed, false);
  assert.equal(catalog.rules.approvalRequired, true);
  assert.match(catalog.rules.privateAnswers, /never publish/i);
  assert.match(catalog.rules.moduleAssessmentEvidence, /backend per-module attempt/i);
});

test('Only one canonical SGSO remains in the 21-course candidate catalog', () => {
  assert.equal(catalog.courses.length, 21);
  const ids = catalog.courses.map((c) => c.courseId);
  assert.equal(new Set(ids).size, 21);
  const sgso = catalog.courses.filter((c) => c.courseId === 'SGSO');
  assert.equal(sgso.length, 1);
  assert.equal(sgso[0].area, 'QSMS');
  assert.match(catalog.canonicalSGSO.excludedCandidate, /M10_7/);
});

test('Each proposed module has at least 20 content slides and 16:9 responsive layout', () => {
  assert.equal(catalog.rules.minimumContentSlidesPerModule, 20);
  assert.match(catalog.rules.layout, /16:9/);
  assert.match(catalog.rules.layout, /mobile and tablet responsive/i);
  for (const course of catalog.courses) {
    assert.ok(Number.isInteger(course.contentSlides) && course.contentSlides >= 20,
      course.courseId);
    assert.equal(course.reviewStatus, 'NOT_APPROVED');
  }
});

test('20 proposed scored courses require 70%, formative CRM has no invented grade', () => {
  const scored = catalog.courses.filter((c) => c.mode === 'SCORED');
  const formative = catalog.courses.filter((c) => c.mode === 'FORMATIVE');
  assert.equal(scored.length, 20);
  assert.equal(formative.length, 1);
  assert.equal(formative[0].courseId, 'costa-do-sol-crm-gestores-rbac119');
  assert.equal(formative[0].proposedPassingScorePercent, null);
  for (const course of scored) {
    assert.equal(course.proposedPassingScorePercent, 70);
  }
});

test('Six retained original module gates cannot be silently turned into final-only passing', () => {
  const gated = catalog.courses.filter((c) => c.moduleGate);
  assert.equal(gated.length, 6);
  assert.deepEqual(new Set(gated.map((c) => c.courseId)), new Set([
    'SGSO',
    'costa-do-sol-doutrinamento-seguranca-qualidade',
    'costa-do-sol-nr20-iniciacao',
    'costa-do-sol-codigo-etica-conduta',
    'costa-do-sol-nr05-cipa',
    'costa-do-sol-stop-work'
  ]));
});
