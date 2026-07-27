/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';

// Este pacote (worker-airtrust) compila sem lib "dom" de propósito (é um
// Cloudflare Worker). Este teste roda em ambiente jsdom via vitest, mas
// acessa os globais do navegador via globalThis/any para não puxar a lib
// "dom" inteira para o projeto (isso quebra tipos de Worker em outros
// arquivos que colidem com tipos DOM, ex. ArrayBuffer/FormData).
type AnyGlobal = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as AnyGlobal;

function extractWrapperScript(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return scripts.join('\n;\n');
}

function setupDom() {
  g.document.body.innerHTML = `
    <div id="status-bar"><span id="status-dot"></span><span id="status-text"></span></div>
    <div id="completion-overlay"><h2></h2><p></p></div>
    <iframe id="scorm-frame"></iframe>
  `;
}

function mockOkFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    clone() {
      return { json: async () => ({ success: true, data: { progresso_pct: 10 } }) };
    },
  });
}

describe('Wrapper SCORM real (execução em jsdom) — dedup de commit e resume único', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('SetValue idêntico não agenda commit; uma alteração real agenda exatamente um commit', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 42,
      titulo: 'Curso teste',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/2/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/scorm/commit/42',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: '{}',
      hasResumeState: false,
    });

    new Function(extractWrapperScript(html))();

    // Sem resume state: autosaveReady é liberado assim que o frame "carrega".
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));

    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;

    api.LMSSetValue('cmi.core.lesson_location', '5/103');
    await new Promise((r) => setTimeout(r, 850));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mesmo valor de novo: não deve agendar/disparar outro commit.
    api.LMSSetValue('cmi.core.lesson_location', '5/103');
    await new Promise((r) => setTimeout(r, 850));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Valor realmente novo: exatamente mais um commit.
    api.LMSSetValue('cmi.core.lesson_location', '6/103');
    await new Promise((r) => setTimeout(r, 850));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mudança apenas de session_time não dispara novo commit (fingerprint ignora campos de tempo)', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 42,
      titulo: 'Curso teste',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/2/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/scorm/commit/42',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: '{}',
      hasResumeState: false,
    });

    new Function(extractWrapperScript(html))();
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));

    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;

    api.LMSSetValue('cmi.core.lesson_location', '5/103');
    await new Promise((r) => setTimeout(r, 850));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Apenas session_time muda (não agenda commit por si só). O heartbeat
    // periódico do wrapper (a cada 15s) chama scheduleCommit(0) incondicionalmente;
    // o fingerprint de dedup deve ignorar session_time/total_time e não gerar
    // um novo fetch nesse caso.
    api.LMSSetValue('cmi.core.session_time', '0000:05:00.00');
    await new Promise((r) => setTimeout(r, 15_050));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }, 20_000);

  it('não reabre o restore depois de uma navegação manual do usuário', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 42,
      titulo: 'Curso teste',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/2/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/scorm/commit/42',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: JSON.stringify({ 'cmi.core.lesson_location': '5/103' }),
      hasResumeState: true,
    });

    new Function(extractWrapperScript(html))();

    // Navegação manual antes do primeiro load do frame.
    g.window.dispatchEvent(
      new g.MessageEvent('message', { data: { type: 'lms:navigate', direction: 'next' } }),
    );

    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));
    await new Promise((r) => setTimeout(r, 900));

    // autosave deve ter sido liberado mesmo sem o restore rodar (else branch).
    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSSetValue('cmi.core.lesson_location', '9/103');
    await new Promise((r) => setTimeout(r, 850));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Wrapper SCORM real (execução em jsdom) — REVIEW_MODE nunca chama o endpoint de conclusão', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function buildReviewHtml() {
    return buildLaunchPage({
      matriculaId: 42,
      titulo: 'Curso teste',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/2/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/scorm/commit/42',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: JSON.stringify({ 'cmi.core.lesson_status': 'passed' }),
      hasResumeState: true,
      reviewMode: true,
    });
  }

  it('em modo revisão, o pacote sinalizando status=passed no bootstrap nunca chama o endpoint de commit', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    new Function(extractWrapperScript(buildReviewHtml()))();
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));

    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    api.LMSCommit();
    await new Promise((r) => setTimeout(r, 900));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('em modo revisão, o overlay "Concluído!" do wrapper nunca é mostrado', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    new Function(extractWrapperScript(buildReviewHtml()))();
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));

    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSSetValue('cmi.core.lesson_status', 'passed');
    api.LMSCommit();
    await new Promise((r) => setTimeout(r, 900));

    expect(g.document.getElementById('completion-overlay').classList.contains('show')).toBe(false);
  });

  it('fora do modo revisão (reviewMode=false), o mesmo cenário ainda comita normalmente', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 42,
      titulo: 'Curso teste',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/2/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/scorm/commit/42',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: '{}',
      hasResumeState: false,
      reviewMode: false,
    });

    new Function(extractWrapperScript(html))();
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));

    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSSetValue('cmi.core.lesson_location', '5/103');
    await new Promise((r) => setTimeout(r, 850));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
