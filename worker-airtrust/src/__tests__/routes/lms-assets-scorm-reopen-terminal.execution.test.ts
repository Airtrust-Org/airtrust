/**
 * @vitest-environment jsdom
 *
 * #1311 / RELATORIO_EAD 3.4: Doutrinamento #15 (passed/100, 53/53) and EFB #4
 * reopened as incomplete/0. Executes the REAL generated wrapper script and
 * simulates the package engine re-initializing its CMI after a terminal state.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';
import { buildScormLaunchState } from '../../services/lms-scorm-launch-state';

type AnyGlobal = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as AnyGlobal;
type ScormApi = Record<string, (...args: unknown[]) => string>;

function extractWrapperScript(html: string): string {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n;\n');
}

function setupDom() {
  delete (g.window as Record<string, unknown>).API;
  delete (g.window as Record<string, unknown>).API_1484_11;
  g.document.body.innerHTML = `
    <div id="status-bar"><span id="status-dot"></span><span id="status-text"></span></div>
    <div id="completion-overlay"><h2></h2><p></p></div>
    <iframe id="scorm-frame"></iframe>
  `;
}

function mockOkFetch() {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200,
    clone() { return { json: async () => ({ success: true, data: { progresso_pct: 100 } }) }; },
  });
}

const PERSISTED_15 = {
  'cmi.core.lesson_status': 'passed',
  'cmi.core.score.raw': '100',
  'cmi.core.score.max': '100',
  'cmi.core.lesson_location': '53/53',
  'cmi.location': '53/53',
  'cmi.suspend_data': '{"s":52,"d":[0,1,2],"mq":{"q1":1}}',
  'cmi.core.exit': 'suspend',
  'airtrust.total_slides': 53,
  'airtrust.viewed_slides': Array.from({ length: 53 }, (_, i) => i + 1),
};

// Every executed wrapper keeps its window listeners for the jsdom lifetime;
// a unique enrollment per launch isolates the assertions from older instances.
let nextMatriculaId = 1500;
let currentMatriculaId = 0;

function launch(opts: {
  cmi: Record<string, unknown> | null; suspend?: string | null; review?: boolean;
  is2004?: boolean; persisted?: Record<string, unknown> | null;
}) {
  const state = buildScormLaunchState(
    opts.cmi ? JSON.stringify(opts.cmi) : null, opts.suspend ?? null, Boolean(opts.is2004),
    Boolean(opts.review), null, { persisted: opts.persisted ?? null },
  );
  currentMatriculaId = ++nextMatriculaId;
  const html = buildLaunchPage({
    matriculaId: currentMatriculaId, cicloId: 77, numeroCiclo: 1, titulo: 'Doutrinamento Básico',
    launchUrl: 'https://api.airtrust.online/lms/scorm/assets/6/15/pkg/index.html',
    commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
    token: '', isScorm2004: Boolean(opts.is2004), initialCmiJson: state.initialCmiJson,
    hasResumeState: state.hasResumeState, reviewMode: Boolean(opts.review),
  });
  new Function(extractWrapperScript(html))();
  return (opts.is2004 ? g.window.API_1484_11 : g.window.API) as ScormApi;
}

function bodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .map(([, init]) => JSON.parse(String((init as { body: string }).body)))
    .filter((body) => body.matricula_id === currentMatriculaId);
}

describe('#1311 reopen of a terminal SCORM 1.2 enrollment (Doutrinamento #15 engine)', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('serves persisted status/score/bookmark/suspend_data on LMSInitialize with entry=resume', () => {
    vi.stubGlobal('fetch', mockOkFetch());
    const api = launch({ cmi: PERSISTED_15 });
    expect(api.LMSInitialize('')).toBe('true');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('100');
    expect(api.LMSGetValue('cmi.core.lesson_location')).toBe('53/53');
    expect(api.LMSGetValue('cmi.suspend_data')).toBe(PERSISTED_15['cmi.suspend_data']);
    expect(api.LMSGetValue('cmi.core.entry')).toBe('resume');
    expect(api.LMSGetValue('cmi.core.lesson_mode')).toBe('normal');
    expect(api.LMSGetValue('cmi.core.credit')).toBe('credit');
  });

  it('package re-init writes incomplete/0: commit, LMSFinish and late unload beacon stay passed/100', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);
    const api = launch({ cmi: PERSISTED_15 });
    api.LMSInitialize('');
    // The engine inside the ZIP resets its runtime on reopen.
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    api.LMSSetValue('cmi.core.score.raw', '0');
    api.LMSSetValue('cmi.core.lesson_location', '52/53');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('100');
    expect(api.LMSGetValue('cmi.core.lesson_location')).toBe('53/53');

    api.LMSCommit('');
    api.LMSFinish('');
    g.window.dispatchEvent(new g.Event('pagehide'));
    await vi.waitFor(() => expect(bodies(fetchMock).length).toBeGreaterThanOrEqual(2));
    await new Promise((r) => setTimeout(r, 50));

    const sent = bodies(fetchMock);
    expect(sent.map((b) => b.commit_event)).toContain('SCORM_FINISH');
    for (const body of sent) {
      expect(body).toMatchObject({ lesson_status: 'passed', score_raw: 100, ciclo_id: 77 });
      const cmi = JSON.parse(body.cmi_json);
      expect(cmi['cmi.core.lesson_status']).toBe('passed');
      expect(cmi['cmi.core.score.raw']).toBe('100');
      // Review/reopen data goes only to a non-terminal audit field.
      expect(cmi['airtrust.runtime_regression']).toEqual({
        'cmi.core.lesson_status': 'incomplete', 'cmi.core.score.raw': '0',
      });
    }
  });

  it('a legacy regressive cmi_json is healed from the guarded columns before the package reads it', () => {
    vi.stubGlobal('fetch', mockOkFetch());
    const api = launch({
      cmi: { ...PERSISTED_15, 'cmi.core.lesson_status': 'incomplete', 'cmi.core.score.raw': '0' },
      persisted: { lesson_status: 'passed', score_raw: 100, score_max: 100, score_min: 0 },
    });
    api.LMSInitialize('');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('100');
  });

  it('in-session lock: once the package reports passed, a later incomplete never reaches the commit', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);
    const api = launch({ cmi: null });
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.score.raw', '80');
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    api.LMSSetValue('cmi.core.score.raw', '100'); // genuine improvement is accepted
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    api.LMSSetValue('cmi.core.score.raw', '0');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('100');
    api.LMSFinish('');
    await vi.waitFor(() =>
      expect(bodies(fetchMock).some((b) => b.commit_event === 'SCORM_FINISH')).toBe(true));
    const finish = bodies(fetchMock).find((b) => b.commit_event === 'SCORM_FINISH');
    expect(finish).toMatchObject({ lesson_status: 'passed', score_raw: 100 });
  });

  it('terminal snapshot retains suspend_data against equal-length/longer reset after reopening', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);
    const api = launch({ cmi: PERSISTED_15 });
    api.LMSInitialize('');
    const original = String(PERSISTED_15['cmi.suspend_data']);
    const equalLengthReset = original.replace('"s":52', '"s":01');
    expect(equalLengthReset.length).toBe(original.length);
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    api.LMSSetValue('cmi.suspend_data', equalLengthReset);
    api.LMSSetValue('cmi.suspend_data', equalLengthReset + 'more-data');
    expect(api.LMSGetValue('cmi.suspend_data')).toBe(original);
    api.LMSCommit('');
    await vi.waitFor(() => expect(bodies(fetchMock).length).toBeGreaterThan(0));
    for (const body of bodies(fetchMock)) {
      expect(body.suspend_data).toBe(original);
      const committed = JSON.parse(body.cmi_json);
      expect(committed['cmi.suspend_data']).toBe(original);
      expect(committed['airtrust.runtime_regression']['cmi.suspend_data']).toBe('[blocked]');
    }
  });

  it('non-terminal sessions keep ordinary incomplete/score updates (no lock without terminal)', () => {
    vi.stubGlobal('fetch', mockOkFetch());
    const api = launch({ cmi: { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.score.raw': '60' } });
    api.LMSSetValue('cmi.core.score.raw', '20');
    api.LMSSetValue('cmi.core.lesson_status', 'failed');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('20');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('failed');
  });
});

describe('#1311 completed (CONCLUIDO) review', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('delivers review/no-credit with the terminal snapshot and never writes, even on Finish/unload', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);
    const api = launch({ cmi: PERSISTED_15, review: true,
      persisted: { lesson_status: 'passed', score_raw: 100 } });
    api.LMSInitialize('');
    expect(api.LMSGetValue('cmi.core.lesson_mode')).toBe('review');
    expect(api.LMSGetValue('cmi.core.credit')).toBe('no-credit');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
    expect(api.LMSGetValue('cmi.core.score.raw')).toBe('100');
    expect(api.LMSGetValue('cmi.core.entry')).toBe('resume');
    expect(api.LMSGetValue('cmi.suspend_data')).toBe(PERSISTED_15['cmi.suspend_data']);
    api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
    api.LMSSetValue('cmi.core.score.raw', '0');
    expect(api.LMSGetValue('cmi.core.lesson_status')).toBe('passed');
    api.LMSCommit('');
    api.LMSFinish('');
    g.window.dispatchEvent(new g.Event('pagehide'));
    await new Promise((r) => setTimeout(r, 900));
    expect(bodies(fetchMock)).toEqual([]);
  });
});

describe('#1311 SCORM 2004 terminal lock', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('completed/passed/scaled survive Initialize -> incomplete/unknown/0 and are committed', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);
    const api = launch({ is2004: true, cmi: {
      'cmi.completion_status': 'completed', 'cmi.success_status': 'passed',
      'cmi.score.raw': '100', 'cmi.score.scaled': '1', 'cmi.location': '50/50',
      'cmi.suspend_data': 'efb-final',
    } });
    api.Initialize('');
    expect(api.GetValue('cmi.mode')).toBe('normal');
    expect(api.GetValue('cmi.entry')).toBe('resume');
    api.SetValue('cmi.completion_status', 'incomplete');
    api.SetValue('cmi.success_status', 'unknown');
    api.SetValue('cmi.score.scaled', '0');
    api.SetValue('cmi.score.raw', '0');
    api.Terminate('');
    await vi.waitFor(() => expect(bodies(fetchMock).length).toBeGreaterThan(0));
    expect(bodies(fetchMock)[0]).toMatchObject({
      commit_event: 'SCORM_FINISH', completion_status: 'completed',
      success_status: 'passed', score_raw: 100, score_scaled: 1,
    });
  });
});
