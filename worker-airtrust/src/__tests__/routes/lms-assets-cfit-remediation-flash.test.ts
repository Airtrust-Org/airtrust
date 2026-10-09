/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { buildLaunchPage } from '../../routes/lms-assets';

// The Worker intentionally excludes the DOM lib. jsdom is available only at test runtime.
type AnyGlobal = typeof globalThis & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const g = globalThis as AnyGlobal;

function wrapperScript(html: string): string {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n;\n');
}

function startWithState(state: Record<string, string>, enrollmentId = 842) {
  const w = g.window;
  delete w.API;
  g.document.body.innerHTML = '<div id="status-bar"><span id="status-dot"></span><span id="status-text"></span></div><div id="completion-overlay"></div><iframe id="scorm-frame"></iframe>';
  const frame = g.document.getElementById('scorm-frame');
  const html = buildLaunchPage({
    matriculaId: enrollmentId,
    titulo: 'CFIT em Helicópteros',
    launchUrl: 'https://api.airtrust.online/lms/scorm/assets/6/41/pkg/index.html',
    commitUrl: 'https://api.airtrust.online/api/lms/matriculas/scorm/commit',
    token: 'test',
    isScorm2004: false,
    initialCmiJson: JSON.stringify(state),
    hasResumeState: true,
  });
  new Function(wrapperScript(html))();
  return { frame, api: w.API! };
}

describe('CFIT remediation — wrapper resume + autosave visual stability', () => {
  it('respects package-owned pending cursor rather than force historical 41/41', async () => {
    const suspendData = JSON.stringify({
      s: 17, d: ['s01', 's02'], sc: [], mq: { chapter2: { passed: false } },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      clone: () => ({ json: async () => ({ success: true, data: { progresso_pct: 100 } }) }),
    }));
    const { frame, api } = startWithState({
      'cmi.core.lesson_location': '41/41',
      'cmi.core.lesson_status': 'incomplete',
      'cmi.suspend_data': suspendData,
    });
    frame.contentWindow!.document.body.innerHTML =
      '<div id="slide"></div><div id="counter">18/41</div>';
    frame.contentWindow.Scorm = { get: () => suspendData };
    frame.dispatchEvent(new g.Event('load'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(frame.contentWindow!.location.hash).toBe('');
    expect(api.LMSGetValue('cmi.core.lesson_location')).toBe('41/41');
    api.LMSSetValue('cmi.suspend_data', JSON.stringify({
      s: 18, d: ['s01', 's02', 's18'], sc: [], mq: { chapter2: { passed: false } },
    }));
    await new Promise((resolve) => setTimeout(resolve, 875));
    expect(g.document.getElementById('status-bar')?.classList.contains('visible')).toBe(false);
  });

  it('continues legacy hash-based resume when there is no native package cursor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      clone: () => ({ json: async () => ({ success: true, data: { progresso_pct: 10 } }) }),
    }));
    const { frame } = startWithState({
      'cmi.core.lesson_location': '5/41',
      'cmi.core.lesson_status': 'incomplete',
    }, 999);
    frame.contentWindow!.document.body.innerHTML = '<div id="counter">1/41</div>';
    frame.dispatchEvent(new g.Event('load'));
    await new Promise((resolve) => setTimeout(resolve, 275));
    expect(frame.contentWindow!.location.hash).toBe('#slide/5');
  });
});
