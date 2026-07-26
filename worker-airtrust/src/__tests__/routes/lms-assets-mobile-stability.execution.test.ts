/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';

function extractWrapperScript(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return scripts.join('\n;\n');
}

function setupDom() {
  document.body.innerHTML = `
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
    document.getElementById('scorm-frame')!.dispatchEvent(new Event('load'));

    const api = (window as unknown as { API: Record<string, (...args: unknown[]) => unknown> }).API;

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
    document.getElementById('scorm-frame')!.dispatchEvent(new Event('load'));

    const api = (window as unknown as { API: Record<string, (...args: unknown[]) => unknown> }).API;

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
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'lms:navigate', direction: 'next' } }),
    );

    document.getElementById('scorm-frame')!.dispatchEvent(new Event('load'));
    await new Promise((r) => setTimeout(r, 900));

    // autosave deve ter sido liberado mesmo sem o restore rodar (else branch).
    const api = (window as unknown as { API: Record<string, (...args: unknown[]) => unknown> }).API;
    api.LMSSetValue('cmi.core.lesson_location', '9/103');
    await new Promise((r) => setTimeout(r, 850));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
