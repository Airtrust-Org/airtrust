import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker cache guard', () => {
  it('trata navegacoes SPA como network-first', () => {
    expect(serviceWorkerSource).toContain("request.mode === 'navigate'");
    expect(serviceWorkerSource).toContain("request.headers.get('accept')?.includes('text/html')");
  });

  it('usa uma versao de cache atualizada para expulsar runtimes antigos', () => {
    const versionMatch = serviceWorkerSource.match(/const CACHE_VERSION = 'airtrust-v(\d+)'/);

    expect(versionMatch).not.toBeNull();
    expect(Number(versionMatch?.[1] || 0)).toBeGreaterThan(1);
  });

  it('nao reutiliza nem persiste chunks js com mime invalido', () => {
    expect(serviceWorkerSource).toContain('function isValidJavaScriptResponse(response)');
    expect(serviceWorkerSource).toContain('await cache.delete(request)');
    expect(serviceWorkerSource).toContain('return isValidJavaScriptResponse(response);');
  });

  it('nao cacheia nenhuma API autenticada ou mutavel no service worker', () => {
    expect(serviceWorkerSource).toContain('const API_BYPASS_PATHS = [/^\\/api\\//];');
    expect(serviceWorkerSource).not.toContain('const API_CACHE');
    expect(serviceWorkerSource).not.toContain('caches.open(API_CACHE)');
    expect(serviceWorkerSource).not.toContain('MINHA_ESCALA_API_PATTERNS');
  });

  it('ignora cache do service worker para player LMS e APIs', () => {
    expect(serviceWorkerSource).toContain(
      'const LMS_PLAYER_NAV_PATTERNS = [/^\\/lms\\/player\\//];',
    );
    expect(serviceWorkerSource).toContain('const API_BYPASS_PATHS = [/^\\/api\\//];');
    expect(serviceWorkerSource).toMatch(
      /if \(shouldBypassAirTrustCaching\(request\)\) \{\s*event\.respondWith\(\s*fetch\(request\)\.catch/,
    );
    expect(serviceWorkerSource).toContain("statusText: 'Service Unavailable'");
  });
});
