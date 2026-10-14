/**
 * Front D — black-box operational acceptance, NOT a substitute for unit tests.
 * No score/status is written by the harness: only learner-visible actions.
 * Needs approved synthetic staging data; the contract must FAIL if unavailable.
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Choice = { question: string; wrong: string; correct: string };
type Unit = {
  id: string; visualCue: string;
  practice?: Choice;
  official?: { stageId: string; questions: Choice[] };
};
type Enrollment = {
  launchPath: string; snapshotPath: string; editionSha256: string; enrollmentId: number;
  cycleId: number;
};
type Doutrinamento = Enrollment & {
  units: Unit[]; qualificationPath: string; certificatePath: string;
};
type Resume80 = Enrollment & {
  expectedResumeUnitId: string; creditedNavigationIds: string[]; minPreviousPct: number;
};
type External = Enrollment & {
  frameSelectors: string[];
  visualLastPageButton: string; wrongAnswerButton: string;
  correctAnswerButton: string; submitButton: string;
  finishButton: string; scormSnapshotPath: string;
};
type ProjectFixture = {
  doutrinamento: Doutrinamento; resume80: Resume80; external: External;
};
type Profile = {
  baseUrl: string; contentOrigin: string; empresaId: number;
  courseTitle: string; projects: Record<string, ProjectFixture>;
};
type Snapshot = {
  empresa_id: number; matricula_id: number; ciclo_id: number;
  edition_sha256: string; status: string; progresso_pct: number;
  completed_unit_ids: string[];
  attempts: { stage_id: string; attempt_number: number; passed: boolean; score_pct: number }[];
  qualificacao_historico_id: number | null; certificate_id: number | null;
};
const digest = /^[a-f0-9]{64}$/;
const allowedStatuses = new Set(['EM_ANDAMENTO', 'NAO_INICIADO', 'CONCLUIDO']);
function demand(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error('PLAYER3_CONTRACT_MISSING:' + code);
}
function pathOn(origin: string, path: string): string {
  demand(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'),
    'RELATIVE_API_OR_LAUNCH_PATH');
  const url = new URL(path, origin);
  demand(url.origin === origin && !url.username && !url.password, 'CROSS_ORIGIN_PATH');
  return url.href;
}
function load(projectName: string): { profile: Profile; fixture: ProjectFixture } {
  demand(process.env.PLAYER3_QA_ALLOW_WRITES === 'SYNTHETIC_STAGING_ONLY',
    'STAGING_SYNTHETIC_WRITE_APPROVAL');
  const file = process.env.PLAYER3_QA_PROFILE_FILE;
  demand(file && file.length > 0, 'PRIVATE_QA_PROFILE');
  const data = JSON.parse(readFileSync(resolve(file), 'utf8')) as Profile;
  const origin = new URL(data.baseUrl).origin;
  demand(origin === data.baseUrl.replace(/\/$/, '') && origin.startsWith('https://'),
    'HTTPS_STAGING_ORIGIN');
  demand(!['airtrust.online', 'www.airtrust.online'].includes(new URL(origin).hostname),
    'PRODUCTION_FORBIDDEN');
  demand(/staging|stage|qa/i.test(new URL(origin).hostname),
    'EXPLICIT_STAGING_HOST_REQUIRED');
  demand(process.env.PLAYER3_QA_STAGING_ORIGIN === origin,
    'STAGING_ORIGIN_ALLOWLIST');
  demand(Number.isSafeInteger(data.empresaId) && data.empresaId > 0, 'TENANT_ID');
  demand(typeof data.contentOrigin === 'string' &&
    new URL(data.contentOrigin).origin === data.contentOrigin &&
    data.contentOrigin.startsWith('https://') && data.contentOrigin !== origin,
    'ISOLATED_HTML5_CONTENT_ORIGIN');
  const fixture = data.projects?.[projectName];
  demand(fixture, 'PROJECT_FIXTURE_' + projectName);
  const ids = [fixture.doutrinamento, fixture.resume80, fixture.external];
  demand(ids.every(x => Number.isSafeInteger(x.enrollmentId) && x.enrollmentId > 0 &&
    Number.isSafeInteger(x.cycleId) && x.cycleId > 0 &&
    digest.test(x.editionSha256)), 'SYNTHETIC_ENROLLMENT_IDENTITIES');
  demand(new Set(ids.map(x => x.enrollmentId)).size === 3, 'DEDICATED_ENROLLMENTS');
  for (const x of ids) {
    pathOn(origin, x.launchPath); pathOn(origin, x.snapshotPath);
  }
  const d = fixture.doutrinamento;
  demand(d.units.length === 42 && new Set(d.units.map(u => u.id)).size === 42,
    'DOU_RC81_42_UNITS');
  demand(d.units.every(u => u.id && u.visualCue &&
    (!u.official || (u.official.stageId && u.official.questions.length > 0))), 'AUTHOR_UNIT_AND_EXAM_MAP');
  demand(d.units.some(u => u.practice) && d.units.some(u => u.official),
    'FORMATIVE_AND_OFFICIAL_GATES');
  demand(fixture.resume80.minPreviousPct >= 80 &&
    fixture.resume80.minPreviousPct < 100, 'SOURCE_80_PERCENT_BASELINE');
  demand(fixture.resume80.creditedNavigationIds.length > 0, 'REVIEWED_CREDIT_IDS');
  demand(fixture.external.frameSelectors.length > 0, 'SCORM_EXTERNAL_FRAMES');
  pathOn(origin, d.qualificationPath);
  pathOn(origin, d.certificatePath);
  pathOn(origin, fixture.external.scormSnapshotPath);
  return { profile: data, fixture };
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
async function snapshot(
  context: BrowserContext, profile: Profile, enrollment: Enrollment,
): Promise<Snapshot> {
  const s = await apiData<Snapshot>(context, profile.baseUrl, enrollment.snapshotPath);
  demand(s.empresa_id === profile.empresaId && s.matricula_id === enrollment.enrollmentId &&
    s.ciclo_id === enrollment.cycleId && s.edition_sha256 === enrollment.editionSha256,
    'PINNED_TENANT_ENROLLMENT_CYCLE_EDITION');
  demand(allowedStatuses.has(s.status) && Array.isArray(s.completed_unit_ids) &&
    Array.isArray(s.attempts) && Number.isFinite(s.progresso_pct) &&
    s.progresso_pct >= 0 && s.progresso_pct <= 100, 'DURABLE_LEDGER_FIELDS');
  return s;
}
async function evidence(page: Page, testInfo: { attach(name: string, options: {body: Buffer; contentType: string}): Promise<void> },
  label: string) {
  if (process.env.PLAYER3_QA_CAPTURE_ALLOWED === 'SYNTHETIC_ONLY') {
    await testInfo.attach(label, { body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png' });
  }
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
  try {
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
    let failureTested = false;
    for (const [index, unit] of d.units.entries()) {
      await test.step('PLAYER3-UNIT-' + String(index+1).padStart(2, '0') + ':' + unit.id, async () => {
        await expect(page.getByTestId('player3-active-unit-id')).toHaveText(unit.id);
        const iframe = page.frameLocator('iframe[title^="Conteúdo original"]');
        await expect(iframe.getByText(unit.visualCue, {exact:false}).first()).toBeVisible();
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
            await pick(modal, unit.official.questions, 'wrong');
            await modal.getByRole('button', { name: 'Enviar avaliação ao AirTrust' }).click();
            await expect(modal.getByRole('status')).toContainText(/Revise o conteúdo/);
            await expect.poll(async () =>
              (await snapshot(context, profile, d)).attempts.length).toBeGreaterThan(before.attempts.length);
            const failed = await snapshot(context, profile, d);
            expect(failed.status).not.toBe('CONCLUIDO');
            expect(failed.certificate_id).toBeNull();
            expect(failed.attempts.at(-1)?.passed).toBe(false);
            failureTested = true;
          }
          await pick(modal, unit.official.questions, 'correct');
          await modal.getByRole('button', { name: 'Enviar avaliação ao AirTrust' }).click();
          await expect(modal.getByRole('status')).toContainText(/aprovada pelo AirTrust/);
          await expect.poll(async () =>
            (await snapshot(context, profile, d)).attempts.some(a =>
              a.stage_id === unit.official!.stageId && a.passed)).toBe(true);
          await modal.getByRole('button', { name: 'Prosseguir para o próximo módulo' }).click();
        }
        let alreadyPersisted = false;
        if (index === 10) {
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
          alreadyPersisted = resumed.completed_unit_ids.includes(unit.id);
          await expect(page.getByTestId('player3-active-unit-id')).toHaveText(
            alreadyPersisted ? d.units[index + 1].id : unit.id);
        }
        if (!alreadyPersisted) await page.getByTestId('player3-next-unit').click();
        await expect.poll(async () =>
          (await snapshot(context, profile, d)).completed_unit_ids.includes(unit.id)).toBe(true);
      });
      if (index === 20) {
        const before = await snapshot(context, profile, d);
        await evidence(page, testInfo, 'doutrinamento-midpoint');
        // Entire browser session context is closed; no in-memory LMS state survives.
        await context.close();
        ({ context, page } = await openLearner(browser));
        await page.goto(pathOn(profile.baseUrl, d.launchPath));
        await expect(page.getByTestId('player3-active-unit-id')).toHaveText(d.units[21].id);
        const after = await snapshot(context, profile, d);
        expect(after.completed_unit_ids).toEqual(before.completed_unit_ids);
        expect(after.attempts).toEqual(before.attempts);
      }
    }
    demand(failureTested, 'OFFICIAL_FAILURE_RETRY_NOT_EXERCISED');
    await test.step('PLAYER3-FINALIZATION / backend authoritative, never slide counter', async () => {
      const pre = await snapshot(context, profile, d);
      expect(pre.status).not.toBe('CONCLUIDO');
      expect(pre.certificate_id).toBeNull();
      await page.getByTestId('player3-request-finalization').click();
      await expect.poll(async () => (await snapshot(context, profile, d)).status,
        { timeout: 45_000 }).toBe('CONCLUIDO');
      const after = await snapshot(context, profile, d);
      expect(after.progresso_pct).toBe(100);
      expect(after.completed_unit_ids).toEqual(expect.arrayContaining(d.units.map(u => u.id)));
      expect(after.qualificacao_historico_id).toBeGreaterThan(0);
      expect(after.certificate_id).toBeGreaterThan(0);
      await evidence(page, testInfo, 'doutrinamento-certified');
    });
    await test.step('PLAYER3-HISTORY / unique qualification and authentic PDF', async () => {
      const enrolled = await snapshot(context, profile, d);
      const history = await apiData<{empresa_id:number; matricula_id:number; id:number; certificate_id:number; linked_records:number}>(
        context, profile.baseUrl, d.qualificationPath);
      expect(history).toMatchObject({
        empresa_id:profile.empresaId, matricula_id:d.enrollmentId,
        id:enrolled.qualificacao_historico_id, certificate_id:enrolled.certificate_id,
        linked_records:1,
      });
      const token = process.env.PLAYER3_QA_READONLY_BEARER_TOKEN;
      const pdf = await context.request.get(pathOn(profile.baseUrl, d.certificatePath), {
        headers:token ? {Authorization:'Bearer '+token}:{},
      });
      expect(pdf.ok()).toBe(true);
      expect((await pdf.body()).subarray(0, 5).toString('ascii')).toBe('%PDF-');
      await context.close();
      ({context,page} = await openLearner(browser));
      await page.goto(pathOn(profile.baseUrl, d.launchPath));
      const reopened = await snapshot(context, profile, d);
      expect(reopened).toMatchObject({
        status:enrolled.status, progresso_pct:100,
        qualificacao_historico_id:enrolled.qualificacao_historico_id,
        certificate_id:enrolled.certificate_id,
      });
      expect(reopened.attempts).toEqual(enrolled.attempts);
      const again = await apiData<typeof history>(context, profile.baseUrl, d.qualificationPath);
      expect(again.linked_records).toBe(1);
    });
  } finally { await context.close(); }
});

test('Legacy 80%: resume navigation only, without invented examination, grade or certificate', async ({browser}, info) => {
  const {profile,fixture}=load(info.project.name);
  const r=fixture.resume80;
  let {context,page}=await openLearner(browser);
  try {
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
    // Client-visible % / historical SCORM bookmark must not become new official ledger evidence.
    expect(after.completed_unit_ids).not.toEqual(expect.arrayContaining(r.creditedNavigationIds));
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
      (await apiData<{lesson_status:string}>(context,profile.baseUrl,e.scormSnapshotPath)).lesson_status
    ).toBe('failed');
    expect((await snapshot(context,profile,e)).status).not.toBe('CONCLUIDO');
    await context.close();
    ({context,page}=await openLearner(browser));
    await page.goto(pathOn(profile.baseUrl,e.launchPath));
    sco=page;
    for (const selector of e.frameSelectors) sco=sco.frameLocator(selector);
    await sco.getByRole('button',{name:e.correctAnswerButton}).click();
    await sco.getByRole('button',{name:e.submitButton}).click();
    await sco.getByRole('button',{name:e.finishButton}).click();
    await expect.poll(async ()=>
      (await apiData<{lesson_status:string}>(context,profile.baseUrl,e.scormSnapshotPath)).lesson_status
    ).toBe('passed');
    // Only a legitimate visible learner finish may request backend completion.
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
