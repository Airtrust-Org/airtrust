/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';
import {
  buildScormLocationHelpersScript,
  buildScormProgressParsersScript,
} from '../../services/lms-scorm-wrapper-runtime';

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

  it('LMSFinish no slide final envia candidato de conclusão confiável uma única vez', async () => {
    const fetchMock = mockOkFetch();
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 346,
      titulo: 'AW139 - Manutenção',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/32/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'incomplete',
        'cmi.core.lesson_location': '405/405',
        'cmi.core.score.raw': '96',
        'cmi.core.score.max': '100',
      }),
      hasResumeState: true,
    });

    new Function(extractWrapperScript(html))();
    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;

    api.LMSFinish();
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(request.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      matricula_id: 346,
      commit_event: 'SCORM_FINISH',
      completion_candidate: true,
      lesson_status: 'incomplete',
      score_raw: 96,
    });
    expect(body.completion_observed_at).toEqual(expect.any(String));
  });

  it('repete o mesmo Finish após falha HTTP transitória sem perder o candidato final', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        clone() {
          return {
            json: async () => ({
              success: true,
              data: { progresso_pct: 100, novo_status: 'CONCLUIDO' },
            }),
          };
        },
      });
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 346,
      titulo: 'AW139 - Manutenção',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/1/32/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: JSON.stringify({
        'cmi.core.lesson_status': 'incomplete',
        'cmi.core.lesson_location': '405/405',
        'cmi.core.score.raw': '96',
        'cmi.core.score.max': '100',
      }),
      hasResumeState: true,
    });

    new Function(extractWrapperScript(html))();
    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSFinish();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryRequest] = fetchMock.mock.calls[1] as [string, { body: string }];
    expect(JSON.parse(retryRequest.body)).toMatchObject({
      commit_event: 'SCORM_FINISH',
      completion_candidate: true,
      lesson_status: 'incomplete',
    });
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

describe('Wrapper SCORM real (execução em jsdom) — keepalive só no unload/hide', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('commit rotineiro (SetValue) não usa keepalive', async () => {
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
    const [, options] = fetchMock.mock.calls[0];
    expect(options.keepalive).toBe(false);
  });

  it('commit de beforeunload usa keepalive (precisa sobreviver ao teardown da página)', async () => {
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

    g.window.dispatchEvent(new g.Event('pagehide'));
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock).toHaveBeenCalled();
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(lastCall[1].keepalive).toBe(true);
  });
});

describe('Wrapper SCORM real (execução em jsdom) — tratamento de erros non-2xx e sanitização', () => {
  beforeEach(() => {
    setupDom();
    g.localStorage?.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('409 com LMS_QUALIFICATION_COMPLETION_FAILED: não faz retry, exibe mensagem sanitizada e despacha código', async () => {
    const errorJson = {
      success: false,
      code: 'LMS_QUALIFICATION_COMPLETION_FAILED',
      error:
        'Não foi possível confirmar a qualificação exigida por este curso. A matrícula não foi concluída — tente novamente.',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      clone() {
        return { json: async () => errorJson };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const postMessages: unknown[] = [];
    g.window.parent = {
      postMessage: (msg: unknown) => {
        postMessages.push(msg);
      },
    };

    const html = buildLaunchPage({
      matriculaId: 390,
      titulo: 'PT6C-67C - Manutenção',
      launchUrl: 'https://api.airtrust.online/lms/scorm/assets/6/34/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/scorm/commit',
      token: 'test-token',
      isScorm2004: false,
      initialCmiJson: JSON.stringify({
        'cmi.core.lesson_location': '108/108',
        'cmi.core.score.raw': '100',
      }),
      hasResumeState: false,
    });

    new Function(extractWrapperScript(html))();
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));

    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSFinish();

    await new Promise((r) => setTimeout(r, 100));

    // 409 é erro funcional definitivo: exatamente 1 chamada, sem retry
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const statusText = g.document.getElementById('status-text')?.textContent;
    expect(statusText).toBe(errorJson.error);

    const saveError = postMessages.find(
      (m: any) => m && m.type === 'lms:save-error' && m.code === 'LMS_QUALIFICATION_COMPLETION_FAILED',
    );
    expect(saveError).toBeDefined();

    const completionError = postMessages.find(
      (m: any) =>
        m && m.type === 'lms:completion-error' && m.code === 'LMS_QUALIFICATION_COMPLETION_FAILED',
    );
    expect(completionError).toBeDefined();
    expect((completionError as any).message).toBe(errorJson.error);
  });

  it('500 com erro do servidor: realiza retries e faz fallback seguro', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      clone() {
        return { json: async () => ({ error: 'Internal Server Error' }) };
      },
    });
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

    // Inicial + 2 retries (com delay de 1200ms cada)
    await new Promise((r) => setTimeout(r, 4000));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resposta non-2xx com corpo inválido/HTML: faz fallback seguro sem quebrar', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      clone() {
        return {
          json: async () => {
            throw new Error('Unexpected token < in JSON at position 0');
          },
        };
      },
    });
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
    await new Promise((r) => setTimeout(r, 4000));

    const statusText = g.document.getElementById('status-text')?.textContent;
    expect(statusText).toBe('Não foi possível salvar o progresso.');
  });
});

// ── Runtime string (produção): progresso a partir de bare lesson_location ─────
// Os pacotes RevLMS de Manutenção (MCQ/MOM/MGM/SGSO/MEL/PT6) escrevem
// `cmi.core.lesson_location` como número simples ("47"), sem total. O wrapper
// precisa completar o total a partir do CONTADOR CONFIÁVEL do pacote
// (`#counterText`/`#counter`/`#progressText`), e nunca de frações arbitrárias
// no body ("FORM-MNT-005/123", "operadores 121/135"). Sem isso o progresso não
// é persistido e a conclusão canônica é rejeitada (LMS_PERSISTED_PROGRESS_REQUIRED).
describe('Runtime string (produção) — bare lesson_location + contador confiável', () => {
  function evalLocationHelpers() {
    const script = buildScormLocationHelpersScript();
    const fn = new Function(
      `${script}; return { parseScormLocationMarker, resolveProbedScormLocation };`,
    );
    return fn() as {
      parseScormLocationMarker: (v: unknown) => { current: number; total: number | null } | null;
      // O runtime de produção usa argumentos posicionais (authored, explicitLocation, domLocation).
      resolveProbedScormLocation: (
        authored: boolean,
        explicitLocation: unknown,
        domLocation: unknown,
      ) => { location: string | null; persist: boolean; reason: string };
    };
  }

  function evalProgressParsers() {
    const script = buildScormProgressParsersScript();
    const fn = new Function(
      `${script}; return { parseProgressFromHeader, parseProgressFromDocument };`,
    );
    return fn() as {
      parseProgressFromHeader: (doc: Document) => { current: number; total: number; pct: number } | null;
      parseProgressFromDocument: (doc: Document) => { current: number; total: number; pct: number } | null;
    };
  }

  function buildDoc(innerHtml: string): Document {
    const doc = g.document.implementation.createHTMLDocument('pkg');
    doc.body.innerHTML = innerHtml;
    return doc;
  }

  it('A: explicit=47 + counter 47/47 + body com 121/135 -> progresso 47/47 (nunca 121/135)', () => {
    const { resolveProbedScormLocation } = evalLocationHelpers();
    const { parseProgressFromDocument } = evalProgressParsers();
    const doc = buildDoc(`
      <div id="counterText">47/47</div>
      <div>Manutenção para operadores 121/135</div>
    `);
    const parsed = parseProgressFromDocument(doc);
    expect(parsed).toEqual({ current: 47, total: 47, pct: 100 });
    const decision = resolveProbedScormLocation(true, '47', '47/47');
    expect(decision).toEqual({ location: '47/47', persist: true, reason: 'dom-fallback' });
  });

  it('B: explicit=69 + counter "Tela 69 de 69" + body com 005/123 -> progresso 69/69', () => {
    const { resolveProbedScormLocation } = evalLocationHelpers();
    const { parseProgressFromDocument } = evalProgressParsers();
    const doc = buildDoc(`
      <div id="progressText">Tela 69 de 69</div>
      <div>FORM-MNT-005/123 Designação e lista de pessoal autorizado</div>
    `);
    const parsed = parseProgressFromDocument(doc);
    expect(parsed).toEqual({ current: 69, total: 69, pct: 100 });
    const decision = resolveProbedScormLocation(true, '69', '69/69');
    expect(decision.location).toBe('69/69');
    expect(decision.persist).toBe(true);
  });

  it('C: explicit=47 + counter incompatível 48/80 -> preserva explicit, não inventa total', () => {
    const { resolveProbedScormLocation } = evalLocationHelpers();
    const decision = resolveProbedScormLocation(true, '47', '48/80');
    expect(decision).toEqual({ location: '47', persist: false, reason: 'dom-current-mismatch' });
  });

  it('D: explicit fraction válida 40/80 -> autoridade, DOM diferente não substitui', () => {
    const { resolveProbedScormLocation } = evalLocationHelpers();
    const decision = resolveProbedScormLocation(true, '40/80', '41/80');
    expect(decision).toEqual({ location: '40/80', persist: false, reason: 'explicit-package-location' });
  });

  it('E: sem explicit location + contador válido -> usa contador', () => {
    const { resolveProbedScormLocation } = evalLocationHelpers();
    const decision = resolveProbedScormLocation(false, null, '47/47');
    expect(decision).toEqual({ location: '47/47', persist: true, reason: 'dom-fallback' });
  });

  it('parseProgressFromDocument prefere o contador confiável antes de varrer o body', () => {
    const { parseProgressFromDocument } = evalProgressParsers();
    const doc = buildDoc(`
      <div id="counter">26/47</div>
      <div>Manutenção para operadores 121/135</div>
      <div>FORM-MNT-005/123</div>
    `);
    const parsed = parseProgressFromDocument(doc);
    // O contador (#counter) vence mesmo com frações maiores no body.
    expect(parsed).toEqual({ current: 26, total: 47, pct: 55 });
  });
});
