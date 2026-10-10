import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const SCRIPT = 'scripts/validation/production-lms-active-course-certification-readonly.mjs';
const WORKFLOW = '.github/workflows/production-lms-active-course-certification-readonly.yml';

test('production active-course certifier is preview/read-only and exact-package aware', () => {
  const source = read(SCRIPT);
  assert.match(source, /assertAllowedProductionBaseUrl/);
  assert.match(source, /EXPECTED_PRODUCTION_SHA/);
  // An all-courses run lasts longer than the short-lived production access token.
  // No course should be reported HTTP 401 solely because the certifier expired.
  assert.match(source, /let token = await productionToken\(\)/);
  assert.match(source, /Date\.now\(\) - tokenIssuedAt >= 15 \* 60_000/);
  assert.match(source, /await assertPinnedProduction\(\);\s*token = await productionToken\(\);\s*tokenIssuedAt = Date\.now\(\);/);

  assert.match(source, /\/api\/lms\/cursos\/\$\{id\}\/scorm-package-versions/);
  assert.match(source, /status\s*\|\|\s*''\)\.toUpperCase\(\)\s*===\s*'ACTIVE'/);
  assert.match(source, /packageSha256/);
  assert.match(source, /\/api\/lms\/assets\/session/);
  assert.match(source, /preview:\s*true/);
  assert.match(source, /\/api\/lms\/scorm\/preview\/\$\{course\.id\}/);
  // The completion verdict is a pure, testable shared helper. The certifier
  // must actually invoke it; merely containing a reason string is insufficient.
  const verdictSource = read('scripts/validation/lms-scorm-functional-certification-gate.mjs');
  assert.match(source, /evaluateScormFunctionalCertification\(/);
  assert.match(verdictSource, /COMPLETION_NOT_REACHED/);
  assert.match(verdictSource, /STATUS_DOWNGRADE_AFTER_REOPEN/);
  assert.match(verdictSource, /SCORE_DOWNGRADE_AFTER_REOPEN/);
  assert.match(source, /reopen-completed/);
  assert.match(source, /locator\('#scorm-frame'\)/);
  assert.match(source, /contentFrame\(\)/);
  assert.match(source, /waitForURL/);
  assert.match(source, /CERT_COURSE_IDS/);
  assert.match(source, /summarizeStalledSlide/);
  assert.match(source, /captureVisibleControls/);
  assert.match(source, /visible_controls/);
  assert.match(source, /drive_diagnostics/);
  assert.match(source, /frame_error_count/);
  assert.match(source, /halted_due_to_repeated_error/);
  assert.match(source, /error_examples/);
  assert.match(source, /question_collection_type/);
  assert.match(source, /question_shape/);
  assert.match(source, /focusedDiagnostics/);
  assert.match(source, /diagnostic_screenshot/);
  assert.match(source, /menuCloseByLocation/);
  assert.match(source, /completionBudgetMs/);
  assert.match(source, /enabledTextNext/);
  assert.match(source, /stepLimit/);
  assert.match(source, /isChoiceButton/);
  assert.match(source, /quizChoicesTried/);
  assert.match(source, /bounded-retry/);
  assert.match(source, /assessment_question_shape/);
  assert.match(source, /isProductChrome/);
  assert.match(source, /content-toggle/);
  assert.match(source, /content-choice/);
  assert.match(source, /untriedChoices/);
  assert.match(source, /visibleDisabledChoices/);
  assert.match(source, /resetTriedByLocation/);
  assert.match(source, /semanticAction/);
  assert.match(source, /retry\.test\(text\)/);
  assert.match(source, /refazer/);
  assert.match(source, /certifiableChoice/);
  assert.match(source, /button\.choice,button\.answer,button\.option/);
  assert.match(source, /const selected = assessmentChoices\.find/);
  assert.match(source, /if \(\(selected \|\| driverAccepted\) && nextQuestion\)/);
  assert.match(source, /if \(\(selected \|\| driverAccepted\) && assessmentFinish && !nextQuestion\)/);
  assert.match(source, /slideIndex/);
  assert.match(source, /assessmentCursorByLocation/);
  assert.match(source, /assessment-answer/);
  assert.match(source, /assessment-next/);
  assert.match(source, /questionMatch/);
  assert.match(source, /plannedQuestion/);
  assert.match(source, /inlineQuizChoices/);
  assert.match(source, /inline-quiz-next/);
  assert.match(source, /assessment-finish/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /candidateOrder/);
  assert.match(source, /assessmentMode/);
  assert.match(source, /moduleRetry/);
  assert.match(source, /retry-deferred/);
  assert.match(source, /assessmentBackfillByLocation/);
  assert.match(source, /shouldStartAssessmentBackfill/);
  assert.match(source, /frame\.evaluate\(\(\{ plan, location, allowAdaptiveRetry \}\)/);
  assert.equal((source.match(/resetAssessmentRetryState\(\)/g) || []).length, 3);
  assert.match(source, /answeredMatch/);
  assert.match(source, /assessment-prev-backfill/);
  assert.match(source, /adaptiveByLocation/);
  assert.match(source, /confirmedAnswers/);
  assert.match(source, /confirmedRetryDone/);
  assert.match(source, /feedbackChoices/);
  assert.match(source, /correctFeedbackIndex/);
  assert.match(source, /data-correct/);
  assert.match(source, /prepareAdaptiveProbe/);
  assert.match(source, /adaptive-retry/);
  assert.match(source, /frame\.evaluate\(\(\{ plan, location, allowAdaptiveRetry \}\)/);
  assert.match(source, /requestTrustedClick/);
  assert.match(source, /trusted_click_token/);
  assert.match(source, /answerAcceptedByLocation/);
  assert.match(source, /questionTotal: 0/);
  assert.match(source, /adaptive\.questionTotal/);
  assert.match(source, /reviewVisitedByLocation/);
  assert.match(source, /reviewCorrectIndex/);
  assert.match(source, /assessment-review-wrong/);
  assert.match(source, /assessment-review-chapter/);
  assert.match(source, /assessment-last-question-next/);
  assert.match(source, /allQuestionDotsAnswered/);
  assert.match(source, /allQuestionsAnswered/);
  assert.match(source, /answeredCount === questionTotal/);
  assert.match(source, /questionNumber === questionTotal/);
  assert.match(source, /requestTrustedClick\(bottomNext/);
  assert.match(source, /driverAccepted/);
  assert.match(source, /data-airtrust-cert-click/);
  assert.match(source, /requiredInteractionMatch/);
  assert.match(source, /required-interaction/);
  assert.match(source, /document\.body\.querySelectorAll\('\*'\)/);
  assert.match(source, /cardShapeHint/);
  assert.match(source, /structuredCardHint/);
  assert.match(source, /structuralGroups/);
  assert.match(source, /structuralCards/);
  assert.match(source, /children\.length !== requiredTotal/);
  assert.match(source, /manifest\.requiredInteractions \|\| 0\) \* 50_000/);
  assert.match(source, /intera\[cç\]\[aã\]o\\s\+obrigat/);
  assert.match(source, /resetAssessmentRetryState/);
  assert.match(source, /adaptive-exhausted/);
  assert.match(source, /resultScoreMatch/);
  assert.match(source, /labeledPercentMatch/);
  assert.match(source, /observedQuestionTotal/);
  assert.match(source, /adaptive\.questionTotal \|\| 0/);
  assert.match(source, /revisar\\s\+/);
  assert.match(source, /COURSE_IDS\.size > 0 \? 3_600 : 0/);
  assert.match(source, /focusedCompletionBudgetMs/);
  assert.match(source, /slideCount \* 4_000/);
  assert.match(source, /content_buttons/);
  assert.match(source, /rect\.bottom > 0/);
  assert.match(source, /action\?\.type === 'none'/);
  assert.match(source, /PPTX_QUALIFYING_COMPLETION_EVIDENCE_REQUIRED/);
  assert.match(source, /generates_qualification/);
  assert.match(source, /forwardId/);
  assert.match(source, /qnext/);
  assert.match(source, /quiznext/);
  assert.match(source, /close-menu/);
  assert.match(source, /resetbtn/);
  assert.match(source, /aria_pressed/);
  assert.match(source, /clickedByLocation/);
  assert.match(source, /captureRequiredInteractionStructure/);
  assert.match(source, /required_interaction_structure/);
  assert.match(source, /document\.querySelectorAll\('\[data-touch\],\.touchable'\)/);
  assert.match(source, /required-interaction-explicit/);
  assert.match(source, /required-explicit/);
  assert.match(source, /parent_child_count/);
  assert.match(source, /text_sample/);
  assert.match(source, /elementsFromPoint/);
  assert.match(source, /hit_tests/);
  assert.match(source, /pointer_events/);
  assert.match(source, /target_text_present/);
  assert.match(source, /text_anchors/);
  assert.match(source, /visual_surfaces/);
  assert.match(source, /createTreeWalker/);
  assert.match(source, /NodeFilter\.SHOW_TEXT/);
  assert.match(source, /captureDriverState/);
  assert.match(source, /driver_state/);
  assert.match(source, /location: currentLocation/);
  assert.match(source, /submit-after-choice/);
  assert.match(source, /interactionsValid/);
  assert.doesNotMatch(source, /interactions\.length\s*>\s*0/);
  assert.match(source, /calls_after_finish/);
  assert.match(source, /completion_reached/);
  assert.match(source, /chromium/);
  assert.match(source, /webkit/);

  assert.doesNotMatch(source, /\/api\/lms\/matriculas\/scorm\/commit/);
  assert.doesNotMatch(source, /method:\s*['"](?:PUT|DELETE|PATCH)['"]/);
  assert.doesNotMatch(source, /wrangler\s+(?:deploy|d1|r2)/i);
});

test('SCORM root menu-collapsed class does not hide mandatory course cards from the certifier', () => {
  const source = read(SCRIPT);
  const rootExemption = '[class*="menu" i]:not(.app-shell)';
  assert.equal(source.split(rootExemption).length - 1, 5);
  assert.doesNotMatch(source, /\[class\*="menu" i\],\[id\*="menu" i\]/);
  // A collapsed (or open) sidebar is not permission to ignore the whole app shell.
  // The actual sidebar and its menu must still be classified as product chrome.
  const markup = `
    <div id="app" class="app-shell menu-collapsed">
      <aside class="sidebar"><nav id="menu" class="menu"><button class="menu-item">Slide 21</button></nav></aside>
      <main><div class="cards">
        <div class="card"><h3>Autorização</h3><ul><li>EO</li><li>Rota</li></ul></div>
        <div class="card"><h3>Tripulação</h3><ul><li>Recência</li><li>Qualificação</li></ul></div>
        <div class="card"><h3>Aeronave</h3><ul><li>Configuração</li><li>Documentos</li></ul></div>
        <div class="card"><h3>Ambiente</h3><ul><li>Meteorologia</li><li>Riscos</li></ul></div>
      </div></main>
    </div>`;
  const document = new JSDOM(markup).window.document;
  const selector = 'aside,nav,header,footer,[class*="sidebar" i],[class*="topbar" i],[class*="bottom-nav" i],' +
    rootExemption + ',[id*="menu" i],[class*="toc" i],[id*="toc" i]';
  assert.equal(document.querySelectorAll('main .card').length, 4);
  for (const card of document.querySelectorAll('main .card')) {
    assert.equal(card.closest(selector), null, 'mandatory learner card must remain eligible');
  }
  assert.ok(document.querySelector('#menu .menu-item').closest(selector), 'navigation menu must stay excluded');
  document.querySelector('#app').className = 'app-shell menu-open';
  for (const card of document.querySelectorAll('main .card')) {
    assert.equal(card.closest(selector), null, 'open menu state must not hide the course cards');
  }
});

test('production certification workflow is governed, online-triggerable, SHA-pinned, secret-scoped and evidence-preserving', () => {
  const workflow = read(WORKFLOW);
  const resolver = read('scripts/validation/resolve-production-lms-active-certification-request.mjs');
  assert.match(workflow, /issue_comment:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /resolve-production-lms-active-certification-request\.mjs/);
  assert.match(workflow, /collaborators\/\$\{actor\}\/permission/);
  assert.match(workflow, /ACTOR_PERMISSION_INSUFFICIENT/);
  assert.match(workflow, /PR_BASE_NOT_MAIN/);
  assert.match(workflow, /PR_FROM_FORK_REJECTED/);
  assert.match(workflow, /needs\.guard\.outputs\.course_ids/);
  assert.match(workflow, /course_ids:/);
  assert.match(workflow, /CERT_COURSE_IDS/);
  assert.doesNotMatch(workflow, /\bpush:/);
  assert.doesNotMatch(workflow, /\bpull_request:/);
  assert.match(workflow, /AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY/);
  assert.match(workflow, /GITHUB_REF.*refs\/heads\/main/);
  assert.match(workflow, /verify-release-gates\.mjs/);
  assert.match(workflow, /api\.airtrust\.online\/api\/version/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /secrets\.PROD_SMOKE_EMAIL/);
  assert.match(workflow, /secrets\.PROD_SMOKE_PASSWORD/);
  assert.match(workflow, /matrix:\s*\n\s*browser:\s*\[chromium, webkit\]/);
  assert.match(workflow, /production-lms-active-course-certification-readonly\.mjs/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /lms-active-certification-diagnostics/);
  assert.match(workflow, /Enforce zero certification failures/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /AIRTRUST_LMS_CERTIFICATION_RESULT/);
  assert.match(workflow, /context\.runId/);
  assert.match(workflow, /github\.rest\.issues\.createComment/);

  assert.match(resolver, /COMMENT_ACTOR_MISMATCH/);
  assert.match(resolver, /COMMENT_COMMAND_MUST_BE_SINGLE_LINE/);
  assert.match(resolver, /COMMENT_COMMAND_INVALID/);
  assert.match(resolver, /COURSE_IDS_INVALID/);
  assert.match(resolver, /OUTPUT_NEWLINE_FORBIDDEN/);
  assert.match(resolver, /AIRTRUST_PRODUCTION_LMS_ACTIVE_CERTIFICATION_READONLY/);

  assert.doesNotMatch(workflow, /CLOUDFLARE_(?:WORKER|PAGES|D1|API)_/);
  assert.doesNotMatch(workflow, /wrangler\s+(?:deploy|d1|r2)/i);
});
