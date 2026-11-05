/**
 * @vitest-environment jsdom
 *
 * Regression for Factory V3 authoring: the learner's explicit inner-SCO end
 * button must not be downgraded to a passive SCORM_FINISH, while auto/unload
 * Finish calls remain unable to issue a qualification. This uses a disposable
 * DOM and mocked transport; a published-package E2E is a separate release gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';

type Browser = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as Browser;

const extractScript = (html: string) =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');

function launch(params: {
  terminal?: boolean;
  lastKind?: string;
  label?: string;
  hasFactoryMetadata?: boolean;
}) {
  g.document.body.innerHTML = [
    '<div id="status-bar"><span id="status-dot"></span><span id="status-text"></span></div>',
    '<div id="completion-overlay"></div>',
    '<iframe id="scorm-frame"></iframe>',
  ].join('');
  delete g.window.API;
  delete g.window.API_1484_11;

  const frame = g.document.getElementById('scorm-frame');
  const inner = frame.contentWindow;
  const doc = inner.document;
  doc.body.innerHTML = '<button id="next">' +
    (params.label ?? 'Confirmar encerramento do estudo') + '</button>';
  if (params.hasFactoryMetadata !== false) {
    inner.COURSE_DATA = {
      packageVersion: 'SYNTHETIC-FACTORY-V3',
      slides: [{ kind: 'lesson' }, { kind: params.lastKind ?? 'study_end' }],
    };
  }

  const addListener = vi.spyOn(doc, 'addEventListener');
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true, status: 200,
    clone: () => ({ json: async () => ({ success: true, data: { progresso_pct: 99 } }) }),
  });
  vi.stubGlobal('fetch', fetchMock);
  const html = buildLaunchPage({
    matriculaId: 1133,
    titulo: 'Factory V3 synthetic runtime',
    launchUrl: 'https://api.airtrust.online/lms/scorm/assets/6/1/index.html',
    commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
    token: '',
    isScorm2004: false,
    initialCmiJson: JSON.stringify({
      'cmi.core.lesson_status': params.terminal ? 'completed' : 'incomplete',
      'cmi.core.lesson_location': '29/29',
    }),
    hasResumeState: false,
  });
  new Function(extractScript(html))();
  const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
  api.LMSInitialize('');
  frame.dispatchEvent(new g.Event('load'));
  const captured = addListener.mock.calls.find(([name, callback]) => name === 'click' && String(callback).includes('factoryV3FinalClick = true'));
  const onClick = captured?.[1] as ((event: unknown) => void) | undefined;
  const button = doc.getElementById('next');
  const click = (isTrusted: boolean) => {
    onClick?.({ isTrusted, target: button });
  };
  const lastPayload = async (): Promise<Record<string, unknown>> => {
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, { body: string }]>;
    return JSON.parse(calls[calls.length - 1][1].body) as Record<string, unknown>;
  };
  return { api, onClick, click, button, lastPayload };
}

describe('Factory V3 user-owned finish bridge (server evidence remains mandatory)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('turns the real explicit end click into a canonical user-finalize request', async () => {
    const test = launch({ terminal: true });
    expect(test.onClick).toBeTypeOf('function');
    test.click(true);
    test.api.LMSFinish('');
    expect(await test.lastPayload()).toMatchObject({
      matricula_id: 1133,
      lesson_status: 'completed',
      commit_event: 'SCORM_USER_FINALIZE',
      completion_candidate: true,
      completion_observed_at: expect.any(String),
    });
  });

  it('keeps terminal LMSFinish passive without the real user gesture', async () => {
    const test = launch({ terminal: true });
    test.api.LMSFinish('');
    expect(await test.lastPayload()).toMatchObject({
      commit_event: 'SCORM_FINISH',
      completion_candidate: null,
      completion_observed_at: null,
    });
  });

  it('never promotes a scripted click or a non-terminal status', async () => {
    const scripted = launch({ terminal: true });
    scripted.click(false);
    scripted.api.LMSFinish('');
    expect((await scripted.lastPayload()).commit_event).toBe('SCORM_FINISH');

    const incomplete = launch({ terminal: false });
    incomplete.click(true);
    incomplete.api.LMSFinish('');
    expect((await incomplete.lastPayload()).commit_event).toBe('SCORM_FINISH');
  });

  it('does not bridge a non-Factory SCO, a wrong button, or a disabled button', async () => {
    const nonFactory = launch({ terminal: true, hasFactoryMetadata: false });
    expect(nonFactory.onClick).toBeUndefined();
    nonFactory.api.LMSFinish('');
    expect((await nonFactory.lastPayload()).commit_event).toBe('SCORM_FINISH');

    const wrongLabel = launch({ terminal: true, label: 'Continuar →' });
    wrongLabel.click(true);
    wrongLabel.api.LMSFinish('');
    expect((await wrongLabel.lastPayload()).commit_event).toBe('SCORM_FINISH');

    const disabled = launch({ terminal: true });
    disabled.button.disabled = true;
    disabled.click(true);
    disabled.api.LMSFinish('');
    expect((await disabled.lastPayload()).commit_event).toBe('SCORM_FINISH');
  });

  it('accepts explicit end-of-assessment click but still requires saved SCORM status', async () => {
    const test = launch({ terminal: true, lastKind: 'assessment', label: 'Concluir curso' });
    test.click(true);
    test.api.LMSFinish('');
    expect((await test.lastPayload()).commit_event).toBe('SCORM_USER_FINALIZE');
  });
});
