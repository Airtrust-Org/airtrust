/**
 * Front D — black-box operational acceptance, NOT a substitute for unit tests.
 * No score/status is written by the harness: only learner-visible actions.
 * Needs approved synthetic staging data; the contract must FAIL if unavailable.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  qaPath as pathOn, requireQa as demand, validateQaProfile,
  validateQaModuleSession,validateQaJointReadiness,validateQaCertificatePdf,
  type QaModuleSession,type QaJointReadiness,
  type QaDoutrinamento,
  type QaChoice as Choice, type QaEnrollment as Enrollment,
  type QaProfile as Profile,
} from './fixture-contract';

type Snapshot = {
  empresa_id: number; matricula_id: number; ciclo_id: number;
  edition_sha256: string; status: string; progresso_pct: number;
  completed_unit_ids: string[];
  attempts: { stage_id: string; attempt_number: number; passed: boolean; score_pct: number }[];
  qualificacao_historico_id: number | null; certificate_id: number | null;
};
const allowedStatuses = new Set(['EM_ANDAMENTO', 'NAO_INICIADO', 'CONCLUIDO']);
function load(projectName: string) {
  demand(process.env.PLAYER3_QA_ALLOW_WRITES === 'SYNTHETIC_STAGING_ONLY',
    'STAGING_SYNTHETIC_WRITE_APPROVAL');
  const file = process.env.PLAYER3_QA_PROFILE_FILE;
  demand(file, 'PRIVATE_QA_PROFILE');
  const raw: unknown = JSON.parse(readFileSync(resolve(file), 'utf8'));
  demand(process.env.PLAYER3_QA_READONLY_BEARER_TOKEN,
    'STAGING_READONLY_API_AUTH');
  return validateQaProfile(raw, projectName,
    process.env.PLAYER3_QA_STAGING_ORIGIN ?? '',
    process.env.PLAYER3_QA_API_ORIGIN ?? '',
    process.env.PLAYER3_QA_SYNTHETIC_TENANT_ID ?? '',
    process.env.PLAYER3_QA_CONTENT_ORIGIN ?? '');
}
async function openLearner(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const state = process.env.PLAYER3_QA_STORAGE_STATE;
  demand(state, 'AUTHORIZED_LEARNER_STORAGE_STATE');
  const context = await browser.newContext({
    storageState: resolve(state), viewport: { width: 1365, height: 850 },
  });
  const page = await context.newPage();
  return { context, page };
}
async function apiData<T>(context: BrowserContext, origin: string, path: string): Promise<T> {
  const token = process.env.PLAYER3_QA_READONLY_BEARER_TOKEN;
  const response = await context.request.get(pathOn(origin, path), {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
    failOnStatusCode: false,
  });
  demand(response.ok(), 'READ_ONLY_ENDPOINT_' + response.status() + '_' + path);
  const json = await response.json() as { success: boolean; data: T };
  demand(json?.success === true && json?.data != null, 'READ_ONLY_JSON_DATA_' + path);
  return json.data;
}
/** A new deployment while this test runs is a blocker, not a flaky failure. */
async function checkStagingProvenance(context: BrowserContext, profile: Profile) {
  const release = await apiData<{
    environment:string; sourceSha:string|null; sourceTree:string|null;
    workerBundleSha256:string|null; releaseManifestSha256:string|null;
  }>(context, profile.apiBaseUrl, '/api/version');
  demand(release.environment === 'staging' &&
    release.sourceSha === profile.expectedSourceSha,
    'STAGING_WORKER_RELEASE_SHA_MISMATCH');
  demand(/^[a-f0-9]{40}$/.test(release.sourceTree ?? '') &&
    /^[a-f0-9]{64}$/.test(release.workerBundleSha256 ?? '') &&
    /^[a-f0-9]{64}$/.test(release.releaseManifestSha256 ?? ''),
    'STAGING_WORKER_BUNDLE_MANIFEST_PROVENANCE_MISSING');
}

async function snapshot(
  context: BrowserContext, profile: Profile, enrollment: Enrollment,
): Promise<Snapshot> {
  const s = await apiData<Snapshot>(context, profile.apiBaseUrl, enrollment.snapshotPath);
  demand(s.empresa_id === profile.empresaId && s.matricula_id === enrollment.enrollmentId &&
    s.ciclo_id === enrollment.cycleId && s.edition_sha256 === enrollment.editionSha256,
    'PINNED_TENANT_ENROLLMENT_CYCLE_EDITION');
  demand(allowedStatuses.has(s.status) && Array.isArray(s.completed_unit_ids) &&
    Array.isArray(s.attempts) && Number.isFinite(s.progresso_pct) &&
    s.progresso_pct >= 0 && s.progresso_pct <= 100, 'DURABLE_LEDGER_FIELDS');
  return s;
}
/** Reconciled stage state persisted and re-graded by Worker, never by React. */
async function moduleSession(context: BrowserContext, profile: Profile,
  course: QaDoutrinamento): Promise<QaModuleSession> {
  const path='/api/lms/native/matriculas/'+course.enrollmentId+'/etapas/sessao';
  const result=await apiData<unknown>(context,profile.apiBaseUrl,path);
  return validateQaModuleSession(result,course.editionSha256,course.cycleId,
    course.units.flatMap(unit=>unit.official?[unit.official.stageId]:[]));
}

/** Backend-grade checked content + official module readiness; advisory, not certification. */
async function jointReadiness(context: BrowserContext, profile: Profile,
  course: QaDoutrinamento): Promise<QaJointReadiness> {
  const path='/api/lms/native/matriculas/'+course.enrollmentId+'/etapas/prontidao';
  const result=await apiData<unknown>(context,profile.apiBaseUrl,path);
  return validateQaJointReadiness(result,course,
    course.requiredLessonIds.length,
    course.units.filter(unit=>!!unit.official).length);
}

async function evidence(page: Page, testInfo: { attach(name: string, options: {body: Buffer; contentType: string}): Promise<void> },
  label: string) {
  if (process.env.PLAYER3_QA_CAPTURE_ALLOWED === 'SYNTHETIC_ONLY') {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png' });
  }
}
/**
 * Preserve private HTML5 presentation fidelity: missing origin-owned CSS, fonts,
 * video and images must fail acceptance rather than silently show blank slides.
 * This observes responses only, never intercepts or modifies authored content.
 */
function auditContentAssets(page: Page, contentOrigin: string, problems: string[]) {
  const watched = new Set(['script','stylesheet','image','media','font']);
  page.on('requestfailed', req => {
    try {
      if (watched.has(req.resourceType()) &&
        new URL(req.url()).origin === contentOrigin) {
        problems.push('NETWORK_FAILURE:' + req.resourceType() + ':' +
          new URL(req.url()).pathname + ':' + (req.failure()?.errorText ?? 'unknown'));
      }
    } catch { /* Non-HTTP browser-internal requests are not origin assets. */ }
  });
  page.on('response', response => {
    try {
      if (watched.has(response.request().resourceType()) &&
        new URL(response.url()).origin === contentOrigin && response.status() >= 400) {
        problems.push('ASSET_HTTP_' + response.status() + ':' +
          new URL(response.url()).pathname);
      }
    } catch { /* Blob URLs do not represent fetches to the content origin. */ }
  });
}

async function pick(dialog: ReturnType<Page['getByRole']>, choices: Choice[], variant: 'wrong'|'correct') {
  for (const q of choices) {
    // Question and option labels are private, reviewed QA fixture data; not in Git.
    await dialog.getByRole('radio', { name: q[variant], exact: true }).check();
  }
}
test('Doutrinamento RC8.1: 42 units, formative gates, failed/retry, durable completion, qualification and PDF', async ({ browser }, testInfo) => {
  const { profile, fixture } = load(testInfo.project.name);
  const d = fixture.doutrinamento;
  let { context, page } = await openLearner(browser);
  const contentAssetProblems: string[] = [];
  auditContentAssets(page, profile.contentOrigin, contentAssetProblems);
  try {
    await checkStagingProvenance(context, profile);
    await test.step('PLAYER3-LAUNCH / original HTML5 on a separate origin', async () => {
      await page.goto(pathOn(profile.baseUrl, d.launchPath));
      await expect(page.getByTestId('player3-root')).toBeVisible();
      const frame = page.locator('iframe[title^="Conteúdo original"]');
      await expect(frame).toHaveCount(1);
      const src = await frame.getAttribute('src');
      demand(src && new URL(src).origin === profile.contentOrigin,
        'AUTHENTICATED_ISOLATED_CONTENT_FRAME');
      await expect(page.getByText(profile.courseTitle, {exact:false}).first()).toBeVisible();
      await evidence(page, testInfo, 'doutrinamento-start');
    });
    const original = await snapshot(context, profile, d);
    demand(original.status !== 'CONCLUIDO', 'FRESH_ENROLLMENT_NOT_ALREADY_COMPLETED');
    const originalStages=await moduleSession(context,profile,d);
    demand(!originalStages.allOfficialStagesPassed &&
      originalStages.stages.every(stage=>stage.attempts===0 && !stage.passed),
      'FRESH_MODULAR_ENROLLMENT_NOT_ALREADY_GRADED');
    const initialReadiness=await jointReadiness(context,profile,d);
    expect(initialReadiness.readyForAtomicTerminalPreflight).toBe(false);
    expect(initialReadiness.completion_supported).toBe(false);
    const offlineUnitIndex=d.units.findIndex((unit,index)=>
      index>0 && index<d.units.length-1 && !!unit.lessonId && !unit.official);
    demand(offlineUnitIndex>=0,'AUTHORED_OFFLINE_LESSON_RECEIPT_REQUIRED');
    let failureTested = false;
    for (const [index, unit] of d.units.entries()) {
      await test.step('PLAYER3-UNIT-' + String(index+1).padStart(2, '0') + ':' + unit.id, async () => {
        await expect(page.getByTestId('player3-active-unit-id')).toHaveText(unit.id);
        const iframe = page.frameLocator('iframe[title^="Conteúdo original"]');
        await expect(iframe.getByText(unit.visualCue, {exact:false}).first()).toBeVisible();
        // Opt-in evidence for human side-by-side parity review of all authored units.
        await evidence(page, testInfo, 'dou-original-'+String(index+1).padStart(2,'0'));
        if (unit.practice) {
          const practice = page.getByTestId('player3-practice');
          await practice.getByRole('radio', { name: unit.practice.wrong, exact: true }).check();
          await practice.getByRole('button', { name: 'Responder fixação' }).click();
          await expect(practice.getByRole('status')).toBeVisible();
          await practice.getByRole('radio', { name: unit.practice.correct, exact: true }).check();
          await practice.getByRole('button', { name: 'Responder fixação' }).click();
          await expect(practice.getByRole('status')).toContainText(/corret|acert|aprov/i);
        }
        if (unit.official) {
          const modal = page.getByRole('dialog', { name: /Avaliação AirTrust/ });
          await expect(modal).toBeVisible();
          if (!failureTested) {
            const before = await snapshot(context, profile, d);
            const beforeStages=await moduleSession(context,profile,d);
            const stageBefore=beforeStages.stages.find(s=>s.stageId===unit.official!.stageId);
            demand(stageBefore,'REQUIRED_STAGE_NOT_REGISTERED');
            await pick(modal, unit.official.questions, 'wrong');
            await modal.getByRole('button', { name: 'Enviar avaliação ao AirTrust' }).click();
            await expect(modal.getByRole('status')).toContainText(/Revise o conteúdo/);
            await expect.poll(async () =>
              (await snapshot(context, profile, d)).attempts.length).toBeGreaterThan(before.attempts.length);
            const failed = await snapshot(context, profile, d);
            expect(failed.status).not.toBe('CONCLUIDO');
            expect(failed.certificate_id).toBeNull();
            expect(failed.attempts.at(-1)?.passed).toBe(false);
            const stageFailed=(await moduleSession(context,profile,d)).stages
              .find(s=>s.stageId===unit.official!.stageId);
            expect(stageFailed?.attempts).toBe(stageBefore.attempts+1);
            expect(stageFailed?.passed).toBe(false);
            expect(stageFailed?.nextAttemptNumber).toBe(stageBefore.attempts+2);
            const notReady=await jointReadiness(context,profile,d);
            expect(notReady.readyForAtomicTerminalPreflight).toBe(false);
            expect(notReady.completion_supported).toBe(false);
            failureTested = true;
          }
          await pick(modal, unit.official.questions, 'correct');
          await modal.getByRole('button', { name: 'Enviar avaliação ao AirTrust' }).click();
          await expect(modal.getByRole('status')).toContainText(/aprovada pelo AirTrust/);
          await expect.poll(async () =>
            (await snapshot(context, profile, d)).attempts.some(a =>
              a.stage_id === unit.official!.stageId && a.passed)).toBe(true);
          await expect.poll(async () =>
            (await moduleSession(context,profile,d)).stages.find(s=>
              s.stageId===unit.official!.stageId)?.passed).toBe(true);
          await modal.getByRole('button', { name: 'Prosseguir para o próximo módulo' }).click();
        }
        let alreadyPersisted = false;
        if (index === offlineUnitIndex) {
          const before = await snapshot(context, profile, d);
          await context.setOffline(true);
          try {
            await page.getByTestId('player3-next-unit').click();
            await expect(page.getByTestId('player3-offline-pending')).toBeVisible();
            // The API test client is independent of browser offline networking.
            const during = await snapshot(context, profile, d);
            expect(during.completed_unit_ids).toEqual(before.completed_unit_ids);
            expect(during.attempts).toEqual(before.attempts);
          } finally {
            await context.setOffline(false);
          }
          await page.reload();
          const resumed = await snapshot(context, profile, d);
          expect(resumed.attempts).toEqual(before.attempts);
          // The authored screen ID is NOT necessarily the Worker lesson ID.
          alreadyPersisted = resumed.completed_unit_ids.includes(unit.lessonId!);
          await expect(page.getByTestId('player3-active-unit-id')).toHaveText(
            alreadyPersisted ? d.units[index + 1].id : unit.id);
        }
        if (!alreadyPersisted) await page.getByTestId('player3-next-unit').click();
        if(unit.lessonId){
          await expect.poll(async () =>
            (await snapshot(context, profile, d)).completed_unit_ids
              .filter(id=>id===unit.lessonId).length).toBe(1);
        }
        if(unit.official){
          await expect.poll(async()=> (await moduleSession(context,profile,d)).stages
            .find(s=>s.stageId===unit.official!.stageId)?.passed).toBe(true);
        }
      });
      if (index === 20) {
        const before = await snapshot(context, profile, d);
        const beforeStages = await moduleSession(context,profile,d);
        await evidence(page, testInfo, 'doutrinamento-midpoint');
        // Entire browser session context is closed; no in-memory LMS state survives.
        await context.close();
        ({ context, page } = await openLearner(browser));
        auditContentAssets(page, profile.contentOrigin, contentAssetProblems);
        await page.goto(pathOn(profile.baseUrl, d.launchPath));
        await expect(page.getByTestId('player3-active-unit-id')).toHaveText(d.units[21].id);
        const after = await snapshot(context, profile, d);
        expect(after.completed_unit_ids).toEqual(before.completed_unit_ids);
        expect(after.attempts).toEqual(before.attempts);
        expect((await moduleSession(context,profile,d)).stages)
          .toEqual(beforeStages.stages);
        const resumedReadiness=await jointReadiness(context,profile,d);
        expect(resumedReadiness.verifiedLessons).toBeLessThan(
          resumedReadiness.totalRequiredLessons);
        expect(resumedReadiness.readyForAtomicTerminalPreflight).toBe(false);
      }
    }
    const stagesDone=await moduleSession(context,profile,d);
    demand(stagesDone.allOfficialStagesPassed &&
      stagesDone.stages.every(stage=>stage.passed && stage.attempts>0),
      'EIGHT_OFFICIAL_STAGES_PASSED_WITHOUT_PREMATURE_CERTIFICATION');
    demand(failureTested, 'OFFICIAL_FAILURE_RETRY_NOT_EXERCISED');
    await test.step('PLAYER3-JOINT-READINESS / no certificate from 42/42 and 8/8',async()=>{
      const ready=await jointReadiness(context,profile,d);
      expect(ready).toMatchObject({
        totalRequiredLessons:d.requiredLessonIds.length,
        verifiedLessons:d.requiredLessonIds.length,
        officialStageCount:8,officialStagesPassed:8,
        reason:'READY_FOR_TERMINAL_PREFLIGHT',
        readyForAtomicTerminalPreflight:true,
        completionSupported:false,completion_supported:false,
      });
      const stillOpen=await snapshot(context,profile,d);
      expect(stillOpen.status).not.toBe('CONCLUIDO');
      expect(stillOpen.certificate_id).toBeNull();
    });
    await test.step('PLAYER3-FINALIZATION / backend authoritative, never slide counter', async () => {
      await checkStagingProvenance(context, profile);
      const pre = await snapshot(context, profile, d);
      expect(pre.status).not.toBe('CONCLUIDO');
      expect(pre.certificate_id).toBeNull();
      await page.getByTestId('player3-request-finalization').click();
      await expect.poll(async () => (await snapshot(context, profile, d)).status,
        { timeout: 45_000 }).toBe('CONCLUIDO');
      const after = await snapshot(context, profile, d);
      expect(after.progresso_pct).toBe(100);
      expect(after.completed_unit_ids).toEqual(expect.arrayContaining(
        d.requiredLessonIds));
      expect(after.qualificacao_historico_id).toBeGreaterThan(0);
      expect(after.certificate_id).toBeGreaterThan(0);
      await evidence(page, testInfo, 'doutrinamento-certified');
    });
    await test.step('PLAYER3-HISTORY / unique qualification and authentic PDF', async () => {
      const enrolled = await snapshot(context, profile, d);
      const history = await apiData<{empresa_id:number; matricula_id:number; id:number; certificate_id:number; linked_records:number}>(
        context, profile.apiBaseUrl, d.qualificationPath);
      expect(history).toMatchObject({
        empresa_id:profile.empresaId, matricula_id:d.enrollmentId,
        id:enrolled.qualificacao_historico_id, certificate_id:enrolled.certificate_id,
        linked_records:1,
      });
      const token = process.env.PLAYER3_QA_READONLY_BEARER_TOKEN;
      const pdf = await context.request.get(pathOn(profile.apiBaseUrl, d.certificatePath), {
        headers:token ? {Authorization:'Bearer '+token}:{},
      });
      expect(pdf.ok()).toBe(true);
      const certificateBytes=await pdf.body();
      validateQaCertificatePdf(certificateBytes,pdf.headers()['content-type'] ?? '');
      await context.close();
      ({context,page} = await openLearner(browser));
      auditContentAssets(page, profile.contentOrigin, contentAssetProblems);
      await page.goto(pathOn(profile.baseUrl, d.launchPath));
      const reopened = await snapshot(context, profile, d);
      expect(reopened).toMatchObject({
        status:enrolled.status, progresso_pct:100,
        qualificacao_historico_id:enrolled.qualificacao_historico_id,
        certificate_id:enrolled.certificate_id,
      });
      expect(reopened.attempts).toEqual(enrolled.attempts);
      expect((await moduleSession(context,profile,d)).stages).toEqual(stagesDone.stages);
      const again = await apiData<typeof history>(context, profile.apiBaseUrl, d.qualificationPath);
      expect(again.linked_records).toBe(1);
      expect(again.certificate_id).toBe(enrolled.certificate_id);
      const againPdf = await context.request.get(pathOn(profile.apiBaseUrl,d.certificatePath), {
        headers: token ? {Authorization:'Bearer '+token} : {},
      });
      expect(againPdf.ok()).toBe(true);
      validateQaCertificatePdf(await againPdf.body(),
        againPdf.headers()['content-type'] ?? '');
      expect(contentAssetProblems, 'HTML5 CSS/JS/fonts/images/video request failures')
        .toEqual([]);
    });
  } finally { await context.close(); }
});

test('Legacy 80%: resume navigation only, without invented examination, grade or certificate', async ({browser}, info) => {
  const {profile,fixture}=load(info.project.name);
  const r=fixture.resume80;
  let {context,page}=await openLearner(browser);
  try {
    await checkStagingProvenance(context,profile);
    const before=await snapshot(context,profile,r);
    expect(before.status).not.toBe('CONCLUIDO');
    expect(before.progresso_pct).toBeGreaterThanOrEqual(r.minPreviousPct);
    expect(before.certificate_id).toBeNull();
    await page.goto(pathOn(profile.baseUrl,r.launchPath));
    await expect(page.getByTestId('player3-active-unit-id')).toHaveText(r.expectedResumeUnitId);
    await expect(page.getByTestId('player3-resume-review-state')).toContainText(/revis|crédito|retomad/i);
    const after=await snapshot(context,profile,r);
    expect(after.completed_unit_ids).toEqual(before.completed_unit_ids);
    expect(after.attempts).toEqual(before.attempts);
    expect(after.certificate_id).toBeNull();
    expect(after.status).not.toBe('CONCLUIDO');
    // Previously persisted official units may overlap navigation credits.
    // Equivalence must NOT add new evidence; the before/after equality above is authoritative.
    await context.close();
    ({context,page}=await openLearner(browser));
    await page.goto(pathOn(profile.baseUrl,r.launchPath));
    await expect(page.getByTestId('player3-active-unit-id')).toHaveText(r.expectedResumeUnitId);
    const reopened=await snapshot(context,profile,r);
    expect(reopened.attempts).toEqual(before.attempts);
    expect(reopened.certificate_id).toBeNull();
  } finally { await context.close(); }
});

test('External SCORM 1.2: actual adapter, no fake completion from visual slides, fail/resume/pass/finish', async ({browser},info) => {
  const {profile,fixture}=load(info.project.name);
  const e=fixture.external;
  let {context,page}=await openLearner(browser);
  try {
    await checkStagingProvenance(context,profile);
    await page.goto(pathOn(profile.baseUrl,e.launchPath));
    await expect(page.getByTestId('scorm-compat-root')).toBeVisible();
    let sco: Page | ReturnType<Page['frameLocator']> = page;
    for (const selector of e.frameSelectors) sco=sco.frameLocator(selector);
    await sco.getByRole('button',{name:e.visualLastPageButton}).click();
    // A visible last slide is not completion, even at 100% visual progress.
    let stored=await snapshot(context,profile,e);
    expect(stored.status).not.toBe('CONCLUIDO');
    expect(stored.certificate_id).toBeNull();
    await sco.getByRole('button',{name:e.wrongAnswerButton}).click();
    await sco.getByRole('button',{name:e.submitButton}).click();
    await expect.poll(async ()=>
      (await apiData<{lesson_status:string}>(context,profile.apiBaseUrl,e.scormSnapshotPath)).lesson_status
    ).toBe('failed');
    expect((await snapshot(context,profile,e)).status).not.toBe('CONCLUIDO');
    await context.close();
    ({context,page}=await openLearner(browser));
    await page.goto(pathOn(profile.baseUrl,e.launchPath));
    sco=page;
    for (const selector of e.frameSelectors) sco=sco.frameLocator(selector);
    await checkStagingProvenance(context,profile);
    await sco.getByRole('button',{name:e.correctAnswerButton}).click();
    await sco.getByRole('button',{name:e.submitButton}).click();
    await sco.getByRole('button',{name:e.finishButton}).click();
    await expect.poll(async ()=>
      (await apiData<{lesson_status:string}>(context,profile.apiBaseUrl,e.scormSnapshotPath)).lesson_status
    ).toBe('passed');
    // The package's LMSFinish alone is not certification; the learner must
    // explicitly confirm the wrapper-owned, server-validated closeout.
    expect((await snapshot(context,profile,e)).status).not.toBe('CONCLUIDO');
    await page.getByRole('button',{name:e.learnerCompletionButton,exact:true}).click();
    await expect.poll(async ()=>(await snapshot(context,profile,e)).status,
      {timeout:45_000}).toBe('CONCLUIDO');
    stored=await snapshot(context,profile,e);
    expect(stored.qualificacao_historico_id).toBeGreaterThan(0);
    expect(stored.certificate_id).toBeGreaterThan(0);
    await context.close();
    ({context,page}=await openLearner(browser));
    await page.goto(pathOn(profile.baseUrl,e.launchPath));
    const persisted=await snapshot(context,profile,e);
    expect(persisted.status).toBe('CONCLUIDO');
    expect(persisted.certificate_id).toBe(stored.certificate_id);
  } finally {await context.close();}
});
