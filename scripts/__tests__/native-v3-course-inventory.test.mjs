import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(
  new URL('../../docs/lms/native-v3-course-inventory-20261020.json', import.meta.url), 'utf8'
));
const { courses } = catalog;

test('catalog is review-only and cannot grant publication or grade', () => {
  assert.equal(catalog.status, 'REVIEW_ONLY_NOT_PUBLISHABLE');
  assert.equal(catalog.productionWritesPerformed, false);
  assert.equal(catalog.rules.approvalRequired, true);
  assert.match(catalog.rules.privateAnswers, /never publish/i);
  assert.match(catalog.rules.assessmentImplementation, /PENDING_REAL_WORKER_ATTEMPTS_PER_MODULE/);
  for (const c of courses) {
    assert.equal(c.reviewStatus, 'NOT_APPROVED', c.courseId);
    assert.equal(c.moduleAssessmentImplementationStatus,
      'NOT_IMPLEMENTED_OR_VERIFIED_FOR_REAL_COURSE', c.courseId);
  }
});

test('only one SGSO candidate: QSMS M10.4, source M10.7 retained outside candidate', () => {
  assert.equal(courses.length, 21);
  assert.equal(new Set(courses.map(c => c.courseId)).size, 21);
  const sgso = courses.filter(c => c.courseId === 'SGSO');
  assert.equal(sgso.length, 1);
  assert.equal(sgso[0].area, 'QSMS');
  assert.match(catalog.canonicalSGSO.excludedCandidate, /M10_7/);
});

test('each assessed module individually has at least 20 content slides', () => {
  assert.equal(catalog.rules.minimumContentSlidesPerModule, 20);
  assert.match(catalog.rules.layout, /16:9/);
  assert.match(catalog.rules.layout, /mobile and tablet responsive/i);
  let totalModules = 0, scoredModules = 0;
  for (const c of courses) {
    assert.ok(Array.isArray(c.modules) && c.modules.length > 0, c.courseId);
    const ids = c.modules.map(m => m.moduleId);
    assert.equal(new Set(ids).size, ids.length, c.courseId);
    assert.deepEqual(ids, ids.map((_,i) => `M${String(i+1).padStart(2, '0')}`),c.courseId);
    let count=0;
    for (const m of c.modules) {
      assert.ok(Number.isInteger(m.contentSlides) &&
        m.contentSlides >= catalog.rules.minimumContentSlidesPerModule,
        `${c.courseId}/${m.moduleId}: ${m.contentSlides}`);
      count += m.contentSlides;
      const scored = c.mode === 'SCORED';
      assert.equal(m.requiredAssessment, scored ?
        'SCORED_70_PENDING_PHYSICAL_WORKER_EVIDENCE' : 'FORMATIVE_NO_PASSING_GRADE');
      if (scored) scoredModules++;
      totalModules++;
    }
    assert.equal(count,c.contentSlides,`${c.courseId}: module total differs from course total`);
  }
  assert.equal(totalModules,26);
  assert.equal(scoredModules,24);
});

test('70 percent applies to each scored module; CRM is formative', () => {
  assert.equal(catalog.rules.proposedPassingScorePercent,70);
  const scored=courses.filter(c=>c.mode==='SCORED');
  const formative=courses.filter(c=>c.mode==='FORMATIVE');
  assert.equal(scored.length,20);
  assert.equal(formative.length,1);
  assert.equal(formative[0].courseId,'costa-do-sol-crm-gestores-rbac119');
  assert.equal(formative[0].proposedPassingScorePercent,null);
  assert.equal(formative[0].additionalFormativeAssessmentScreens,1);
  assert.equal(formative[0].contentSlides,41);
  for(const c of scored) {
    assert.equal(c.proposedPassingScorePercent,70,c.courseId);
    assert.equal(c.targetModuleAssessment,true,c.courseId);
  }
  assert.equal(formative[0].targetModuleAssessment,false);
});

test('six historical module gates retained while target plan requires per-module assessment', () => {
  const gated=courses.filter(c=>c.sourceModuleGate);
  assert.deepEqual(new Set(gated.map(c=>c.courseId)),new Set([
    'SGSO','costa-do-sol-doutrinamento-seguranca-qualidade',
    'costa-do-sol-nr20-iniciacao','costa-do-sol-codigo-etica-conduta',
    'costa-do-sol-nr05-cipa','costa-do-sol-stop-work'
  ]));
  for(const c of courses) assert.equal(c.sourceModuleGate,c.moduleGate,c.courseId);
});
