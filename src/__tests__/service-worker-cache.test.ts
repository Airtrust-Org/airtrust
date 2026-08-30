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
  it('trata navegacoes HTML como network-only sem cache local', () => {
    expect(serviceWorkerSource).toContain("request.mode === 'navigate'");
    expect(serviceWorkerSource).toContain("request.headers.get('accept')?.includes('text/html')");
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'no-store' })");
    expect(serviceWorkerSource).toContain("url.pathname === '/sw.js'");
  });

  it('usa uma versao de cache nova e desregistra o sw apos a limpeza', () => {
    const versionMatch = serviceWorkerSource.match(/const CACHE_VERSION = 'airtrust-v(\d+)'/);

    expect(versionMatch).not.toBeNull();
    expect(Number(versionMatch?.[1] || 0)).toBeGreaterThanOrEqual(14);
    expect(serviceWorkerSource).toContain('await self.registration.unregister();');
    expect(serviceWorkerSource).toContain('Promise.resolve(self.skipWaiting())');
  });

  it('limpa caches legados e recarrega clientes criticos, incluindo FRMS, sem cachear runtime novo', () => {
    expect(serviceWorkerSource).toContain('async function purgeLegacyAirTrustCaches()');
    expect(serviceWorkerSource).toContain('cacheName.startsWith(CACHE_PREFIX)');
    expect(serviceWorkerSource).toContain('async function forceRefreshCriticalClients()');
    expect(serviceWorkerSource).toContain('/^\\/frms(?:\\/|$)/');
    expect(serviceWorkerSource).toContain("clientUrl.searchParams.set(LOGIN_SW_RESET_PARAM, CACHE_VERSION);");
    expect(serviceWorkerSource).toContain('await client.navigate(clientUrl.toString());');
    expect(serviceWorkerSource).not.toContain('caches.open(');
  });

  it('executa bootstrap de recuperacao nas rotas de entrada sem registrar novo service worker', () => {
    expect(indexHtmlSource).toContain(
      'const ENTRY_ROUTE_PATTERNS = [/^\\/$/, /^\\/login$/, /^\\/instalar$/, /^\\/frms(?:\\/|$)/];',
    );
    expect(indexHtmlSource).toContain("const RECOVERY_KEY = 'airtrust-login-cache-recovery-v4';");
    expect(indexHtmlSource).toContain("const SW_RESET_PARAM = 'airtrust_sw_reset';");
    expect(indexHtmlSource).toContain('navigator.serviceWorker.getRegistrations()');
    expect(indexHtmlSource).not.toContain("navigator.serviceWorker.register('/sw.js', {");
    expect(indexHtmlSource).toContain('registration.unregister?.()');
    expect(indexHtmlSource).toContain("currentUrl.searchParams.set(RECOVERY_PARAM, '1');");
    expect(indexHtmlSource).toContain('window.location.replace(currentUrl.toString());
  });

  it('desregistra service workers existentes e limpa caches no sw-manager sem registrar outro', () => {
    const bypassFunctionMatch = serviceWorkerManagerSource.match(
      /function shouldBypassCleanupForPath\(pathname: string\): boolean \{([\s\S]*?)\n\}/,
    );

    expect(serviceWorkerManagerSource).toContain(
      "const LOGIN_CACHE_RECOVERY_SESSION_KEY = 'airtrust-login-cache-recovery-v4';",
    );
    expect(serviceWorkerManagerSource).toContain(
      "const LOGIN_CACHE_RECOVERY_QUERY_PARAM = 'airtrust_login_recovered';",
    );
    expect(serviceWorkerManagerSource).toContain('async function unregisterExistingServiceWorkers()');
    expect(serviceWorkerManagerSource).toContain('await cleanupLegacyServiceWorkers();');
    expect(serviceWorkerManagerSource).toContain('registration.unregister().catch(() => false)');
    expect(serviceWorkerManagerSource).not.toContain("navigator.serviceWorker.register('/sw.js', {");
    expect(serviceWorkerManagerSource).toContain('async function recoverLoginPageFromLegacyCaches()');
    expect(bypassFunctionMatch?.[1] || '').toContain("return /^\\/lms\\/player\\//.test(pathname);");
    expect(bypassFunctionMatch?.[1] || '').not.toContain("pathname === '/login'");
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
    expect(headersSource).toContain('\n/frms\n');
    expect(headersSource).toContain('\n/frms/*\n');
    expect(headersSource).toContain('\n/sw.js\n');
    expect(headersSource).toContain('\n/assets/*.js\n');
    expect(headersSource).toContain('\n/assets/*.css\n');
  });
});
