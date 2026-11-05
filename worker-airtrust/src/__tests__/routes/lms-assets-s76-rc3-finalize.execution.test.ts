/**
 * @vitest-environment jsdom
 *
 * S-76 RC3 uses #nextUnit, while Factory V3 uses #next. This checks that a
 * real last-screen click can request server verification but a passive Finish,
 * scripted click, preview or incompatible package cannot.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';

type Browser = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as Browser;
const extractScript = (html: string) =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');

function launch(params: {
  enabled?: boolean; terminal?: boolean; label?: string;
  screen?: string; courseId?: string; version?: string;
  disabled?: boolean; preview?: boolean;
}) {
  g.document.body.innerHTML = [
    '<div id="status-bar"><span id="status-dot"></span><span id="status-text"></span></div>',
    '<div id="completion-overlay"></div>',
    '<iframe id="scorm-frame"></iframe>',
  ].join('');
  delete g.window.API;
  delete g.window.API_1484_11;
  const frame = g.document.getElementById('scorm-frame');
  const doc = frame.contentWindow.document;
  doc.body.innerHTML = `<span class="counter">${params.screen ?? '49/49'}</span><button id="nextUnit">${params.label ?? 'Concluir treinamento'}</button>`;
  const button = doc.getElementById('nextUnit') as HTMLButtonElement;
  button.disabled = params.disabled ?? false;
  frame.contentWindow.AIRTRUST_COURSE_MODEL = {
    courseId: params.courseId ?? 's76c-sop-rev03',
    packageVersion: params.version ?? 'v3.4-no-module-exams-rc2-2026-11-02',
    slides: Array.from({ length: 49 }, (_, i) => ({ id: i === 48 ? 'M6-07' : 'M' + i })),
  };
  const observe = vi.spyOn(doc, 'addEventListener');
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    clone: () => ({ json: async () => ({ success: true, data: { progresso_pct: 99 } }) }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const html = buildLaunchPage({
    matriculaId: 690,
    titulo: 'S-76 RC3 immutable package',
    launchUrl: 'https://api.airtrust.online/lms/scorm/assets/6/39/index.html',
    commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
    token: '', isScorm2004: false,
    legacyS76Rc3FinalButton: params.enabled ?? true,
    previewMode: params.preview ?? false,
    initialCmiJson: JSON.stringify({
      'cmi.core.lesson_status': params.terminal === false ? 'incomplete' : 'completed',
      'cmi.core.lesson_location': '49/49',
    }),
  });
  new Function(extractScript(html))();
  const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
  api.LMSInitialize('');
  frame.dispatchEvent(new g.Event('load'));
  const listener = observe.mock.calls.find(([name, cb]) =>
    name === 'click' && String(cb).includes('factoryV3FinalClick = true'))?.[1] as
    ((event: unknown) => void) | undefined;
  const click = (isTrusted: boolean) => listener?.({ isTrusted, target: button });
  const payload = async (): Promise<Record<string, unknown>> => {
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, { body: string }]>;
    return JSON.parse(calls[calls.length - 1][1].body) as Record<string, unknown>;
  };
  return { api, click, listener, button, payload };
}

describe('S-76 RC3 immutable-package explicit finalization bridge', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('promotes a trusted final button click to SCORM_USER_FINALIZE, not a certificate', async () => {
    const t = launch({});
    expect(t.listener).toBeTypeOf('function');
    t.click(true);
    t.api.LMSFinish('');
    expect(await t.payload()).toMatchObject({
      matricula_id: 690,
      commit_event: 'SCORM_USER_FINALIZE',
      lesson_status: 'completed',
      completion_candidate: true,
      completion_observed_at: expect.any(String),
    });
  });

  it('keeps passive LMSFinish passive and does not promote an untrusted click', async () => {
    const t = launch({});
    t.api.LMSFinish('');
    expect((await t.payload()).commit_event).toBe('SCORM_FINISH');
    const scripted = launch({});
    scripted.click(false);
    scripted.api.LMSFinish('');
    expect((await scripted.payload()).commit_event).toBe('SCORM_FINISH');
  });

  it('never promotes an incomplete status, wrong final label, earlier screen or disabled button', async () => {
    for (const p of [
      { terminal: false }, { label: 'Continuar →' },
      { screen: '48/49' }, { disabled: true },
      { courseId: 'another-course' }, { version: 'wrong-version' },
    ]) {
      const t = launch(p);
      t.click(true);
      t.api.LMSFinish('');
      expect((await t.payload()).commit_event).toBe('SCORM_FINISH');
    }
  });

  it('keeps the bridge disabled for other packages and for preview', async () => {
    const other = launch({ enabled: false });
    expect(other.listener).toBeUndefined();
    other.api.LMSFinish('');
    expect((await other.payload()).commit_event).toBe('SCORM_FINISH');
    const preview = launch({ preview: true });
    preview.click(true);
    preview.api.LMSFinish('');
    // A preview cannot make an authenticated learner finalization request.
    expect((await preview.payload()).commit_event).not.toBe('SCORM_USER_FINALIZE');
  });
});
