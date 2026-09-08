/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildLaunchPage } from '../../routes/lms-assets';

type AnyGlobal = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as AnyGlobal;

function extractWrapperScript(html: string): string {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n;\n');
}

function prepareDom() {
  delete (g.window as Record<string, unknown>).API;
  delete (g.window as Record<string, unknown>).API_1484_11;
  g.document.body.innerHTML = `
    <div id="status-bar"><span id="status-dot"></span><span id="status-text"></span></div>
    <div id="completion-overlay"></div>
    <iframe id="scorm-frame"></iframe>
  `;
}

describe('F5-08 SCORM bearer isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('never serializes an access bearer into the wrapper and commits with the HttpOnly cookie', async () => {
    prepareDom();
    const secret = 'SENSITIVE_ACCESS_BEARER_MUST_NOT_REACH_SCO';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      clone: () => ({ json: async () => ({ success: true, data: { progresso_pct: 10 } }) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const html = buildLaunchPage({
      matriculaId: 346,
      titulo: 'Controlled malicious SCO fixture',
      launchUrl: 'https://api.airtrust.online/api/lms/scorm/assets/6/32/pkg/index.html',
      commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
      token: secret,
      isScorm2004: false,
      initialCmiJson: '{}',
      hasResumeState: false,
    });

    expect(html).not.toContain(secret);
    expect(html).not.toContain('lms:auth-token');
    expect(html).not.toContain("Authorization': 'Bearer");
    expect(html).not.toContain('var TOKEN');

    // A same-origin SCO can replace parent.fetch. The intercepted request must
    // still expose no reusable bearer; only the browser-held HttpOnly cookie
    // capability is used.
    new Function(extractWrapperScript(html))();
    g.document.getElementById('scorm-frame').dispatchEvent(new g.Event('load'));
    const api = g.window.API as Record<string, (...args: unknown[]) => unknown>;
    api.LMSSetValue('cmi.core.lesson_location', '2/10');
    await new Promise((resolve) => setTimeout(resolve, 850));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0] as [
      string,
      { headers?: Record<string, string>; credentials?: string },
    ];
    expect(request.headers?.Authorization).toBeUndefined();
    expect(request.credentials).toBe('include');
  });

  it('keeps the React host bearer entirely outside iframe postMessage traffic', () => {
    const source = readFileSync(
      join(process.cwd(), '..', 'src', 'react-app', 'pages', 'lms', 'LmsPlayer.tsx'),
      'utf8',
    );
    expect(source).not.toContain('lms:auth-token');
    expect(source).not.toContain('syncFrameToken');
    expect(source).toContain("fetchWithAuth('/api/lms/assets/session'");
  });
});
