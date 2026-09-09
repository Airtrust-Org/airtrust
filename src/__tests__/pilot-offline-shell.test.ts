import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const pilotIndex = read('public/pilot/index.html');
const pilotManifest = JSON.parse(read('public/pilot/pilot.webmanifest')) as {
  id: string;
  start_url: string;
  scope: string;
  display: string;
};
const pilotApp = read('public/pilot/pilot-app.js');
const pilotVault = read('public/pilot/pilot-vault.js');
const pilotSw = read('public/pilot/pilot-sw.js');
const swManager = read('src/lib/sw-manager.tsx');
const killSwitch = read('public/sw.js');
const rootIndex = read('index.html');

describe('Pilot Offline shell', () => {
  it('mantem o app instalavel estritamente no escopo /pilot/', () => {
    expect(pilotManifest.id).toBe('/pilot/');
    expect(pilotManifest.start_url).toBe('/pilot/');
    expect(pilotManifest.scope).toBe('/pilot/');
    expect(pilotManifest.display).toBe('standalone');
    expect(pilotIndex).toContain('href="/pilot/pilot.webmanifest"');
    expect(pilotApp).toContain("scope: '/pilot/'");
    expect(pilotApp).toContain("register('/pilot/pilot-sw.js'");
  });

  it('usa IndexedDB cifrado em vez de sessionStorage/localStorage para o rascunho', () => {
    expect(pilotVault).toContain("const DB_NAME = 'airtrust-pilot-v1'");
    expect(pilotVault).toContain("'rdv_drafts'");
    expect(pilotVault).toContain("name: 'PBKDF2'");
    expect(pilotVault).toContain("name: 'AES-GCM'");
    expect(pilotVault).toContain('crypto.subtle.encrypt');
    expect(pilotVault).toContain('crypto.subtle.decrypt');
    expect(pilotVault).not.toContain('localStorage');
    expect(pilotVault).not.toContain('sessionStorage');
  });

  it('so declara Salvo no tablet depois da persistencia local concluir', () => {
    const putIndex = pilotApp.indexOf("await vault.putJson(");
    const savedIndex = pilotApp.indexOf("saveStatus.textContent = 'Salvo no tablet.'");
    expect(putIndex).toBeGreaterThan(-1);
    expect(savedIndex).toBeGreaterThan(putIndex);
  });

  it('precacheia o shell e usa fallback offline apenas para navegacao /pilot/', () => {
    expect(pilotSw).toContain("const PILOT_CACHE_VERSION = 'airtrust-pilot-shell-v1'");
    expect(pilotSw).toContain("'/pilot/index.html'");
    expect(pilotSw).toContain("url.pathname.startsWith(PILOT_SCOPE_PATH)");
    expect(pilotSw).toContain("caches.match('/pilot/index.html')");
    expect(pilotSw).toContain("if (url.pathname.startsWith('/api/')) return;");
  });

  it('o cleanup legado preserva Service Worker e caches do Pilot App', () => {
    expect(swManager).toContain("const PILOT_SW_SCOPE_PATH = '/pilot/'");
    expect(swManager).toContain("const PILOT_CACHE_PREFIX = 'airtrust-pilot-'");
    expect(swManager).toContain('!isPilotServiceWorkerRegistration(registration)');
    expect(killSwitch).toContain("const PILOT_CACHE_PREFIX = 'airtrust-pilot-'");
    expect(killSwitch).toContain('!cacheName.startsWith(PILOT_CACHE_PREFIX)');
    expect(rootIndex).toContain("!name.startsWith('airtrust-pilot-')");
    expect(rootIndex).toContain("!new URL(registration.scope).pathname.startsWith('/pilot/')");
  });

  it('rotula explicitamente a primeira fase como teste sem RDV real ou valor regulatorio', () => {
    expect(pilotIndex).toContain('Ela ainda não carrega um RDV real');
    expect(pilotIndex).toContain('não é Diário de Bordo oficial');
  });
});
