import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
const serviceWorkerManagerSource = readFileSync(
  resolve(process.cwd(), 'src/lib/sw-manager.tsx'),
  'utf8',
);
const headersSource = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');
const indexHtmlSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('service worker cache guard', () => {
  it('trata navegacoes SPA como network-first', () => {
    expect(serviceWorkerSource).toContain("request.mode === 'navigate'");
    expect(serviceWorkerSource).toContain("request.headers.get('accept')?.includes('text/html')");
  });

  it('usa uma versao de cache atualizada para expulsar runtimes antigos', () => {
    const versionMatch = serviceWorkerSource.match(/const CACHE_VERSION = 'airtrust-v(\d+)'/);

    expect(versionMatch).not.toBeNull();
    expect(Number(versionMatch?.[1] || 0)).toBeGreaterThanOrEqual(11);
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
    expect(serviceWorkerSource).toContain(
      "const AUTH_BYPASS_PATHS = [/^\\/$/, /^\\/login$/, /^\\/dashboard(?:\\/|$)/, /^\\/mro(?:\\/|$)/];",
    );
    expect(serviceWorkerSource).toContain('const API_BYPASS_PATHS = [/^\\/api\\//];');
    expect(serviceWorkerSource).toMatch(
      /if \(shouldBypassAirTrustCaching\(request\)\) \{\s*event\.respondWith\(\s*fetch\(request\)\.catch/,
    );
    expect(serviceWorkerSource).toContain("statusText: 'Service Unavailable'");
  });

  it('limpa caches legados e forca refresh dos clientes criticos ao ativar novo sw', () => {
    expect(serviceWorkerSource).toContain('async function purgeLegacyAirTrustCaches()');
    expect(serviceWorkerSource).toContain("cacheName.startsWith('airtrust-')");
    expect(serviceWorkerSource).not.toContain('cacheName !== CACHE_VERSION');
    expect(serviceWorkerSource).toContain('async function forceRefreshAuthClients()');
    expect(serviceWorkerSource).toContain("clientUrl.searchParams.set(LOGIN_SW_REFRESH_PARAM, CACHE_VERSION);");
    expect(serviceWorkerSource).toContain('await client.navigate(clientUrl.toString());');
  });

  it('executa bootstrap de recuperacao no login antes do bundle principal', () => {
    expect(indexHtmlSource).toContain("const RECOVERY_KEY = 'airtrust-login-cache-recovery-v3';");
    expect(indexHtmlSource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(indexHtmlSource).toContain("currentUrl.searchParams.set(RECOVERY_PARAM, '1');");
    expect(indexHtmlSource).toContain('window.location.replace(currentUrl.toString());');
  });

  it('mantem recuperacao defensiva tambem no sw-manager do cliente', () => {
    expect(serviceWorkerManagerSource).toContain(
      "const LOGIN_CACHE_RECOVERY_SESSION_KEY = 'airtrust-login-cache-recovery-v3';",
    );
    expect(serviceWorkerManagerSource).toContain(
      "const LOGIN_CACHE_RECOVERY_QUERY_PARAM = 'airtrust_login_recovered';",
    );
    expect(serviceWorkerManagerSource).toContain('async function recoverLoginPageFromLegacyCaches()');
    expect(serviceWorkerManagerSource).toContain('window.location.replace(nextUrl.toString());');
  });

  it('nao mistura no-store global com cache longo dos assets hashados', () => {
    const globalHeadersSection = headersSource.split('# ===== HTML - NUNCA CACHEAR =====')[0] || '';

    expect(globalHeadersSection).not.toContain('Cache-Control:');
    expect(headersSource).not.toContain('\n/*.js\n');
    expect(headersSource).not.toContain('\n/*.css\n');
    expect(headersSource).toContain('\n/login\n');
    expect(headersSource).toContain('\n/dashboard/*\n');
    expect(headersSource).toContain('\n/mro/*\n');
    expect(headersSource).toContain('\n/assets/*.js\n');
    expect(headersSource).toContain('\n/assets/*.css\n');
  });
});
