import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { detectInstallEnvironment } from '@/react-app/utils/installApp';

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/app.webmanifest'), 'utf8'),
) as {
  id: string;
  start_url: string;
  display: string;
  orientation: string;
  icons: Array<{ src: string; sizes: string; purpose?: string }>;
};

const mainSource = readFileSync(resolve(process.cwd(), 'src/react-app/main.tsx'), 'utf8');
const installPageSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/InstallAppPage.tsx'),
  'utf8',
);
const headersSource = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');
const indexHtmlSource = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('AirTrust PWA installation', () => {
  it('detecta iPhone aberto pelo WhatsApp', () => {
    const env = detectInstallEnvironment(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 WhatsApp/2.26.17',
      'Apple Computer, Inc.',
      false,
    );

    expect(env.platform).toBe('ios');
    expect(env.isIos).toBe(true);
    expect(env.isInAppBrowser).toBe(true);
    expect(env.isSafari).toBe(false);
  });

  it('detecta Android em navegador Chromium', () => {
    const env = detectInstallEnvironment(
      'Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36',
      'Google Inc.',
      false,
    );

    expect(env.platform).toBe('android');
    expect(env.isAndroid).toBe(true);
    expect(env.isChromium).toBe(true);
  });

  it('prioriza o estado já instalado', () => {
    const env = detectInstallEnvironment(
      'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile Safari/537.36',
      'Google Inc.',
      true,
    );

    expect(env.platform).toBe('installed');
    expect(env.isStandalone).toBe(true);
  });

  it('abre o app instalado na home correta para qualquer perfil com os ícones oficiais versionados', () => {
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('any');
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/airtrust-pwa-icon-20260830-192.png',
          sizes: '192x192',
          purpose: 'any',
        }),
        expect.objectContaining({
          src: '/airtrust-pwa-icon-20260830-512.png',
          sizes: '512x512',
          purpose: 'any',
        }),
        expect.objectContaining({
          src: '/airtrust-apple-touch-icon-20260830.png',
          sizes: '180x180',
          purpose: 'any',
        }),
      ]),
    );
    expect(manifest.icons.some((icon) => icon.purpose?.includes('maskable'))).toBe(false);
    expect(installPageSource).toContain('src="/airtrust-pwa-icon-20260830-192.png"');
    expect(installPageSource).not.toContain('src="/airtrust-icon.svg"');
    expect(indexHtmlSource).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/airtrust-apple-touch-icon-20260830.png"',
    );
  });

  it('mantém /instalar público, sem cache e com fluxos iOS e Android', () => {
    expect(mainSource).toContain("window.location.pathname === '/instalar'");
    expect(mainSource).toContain('<InstallAppPage />');
    expect(headersSource).toContain('\n/instalar\n  Cache-Control: no-cache, no-store, must-revalidate');
    expect(installPageSource).toContain("window.addEventListener('beforeinstallprompt'");
    expect(installPageSource).toContain('Adicionar à Tela de Início');
    expect(installPageSource).toContain('Abrir no Chrome');
    expect(installPageSource).toContain('Abrir no Safari');
  });
});
