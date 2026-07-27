#!/usr/bin/env node
/**
 * Captura técnica, headed e passiva do runtime SCORM por origem.
 *
 * Não aceita credenciais, nunca imprime valores de cookie/token e mantém o
 * perfil persistente + trace bruto fora do repositório. O resultado salvo no
 * repositório é somente o log sanitizado e o vídeo da sessão.
 *
 * Uso:
 *   AIRTRUST_DIAG_NODE_MODULES=/caminho/para/node_modules \
 *     node scripts/diagnostics/scorm-origin-runtime-capture.mjs production
 *
 * Origens aceitas: production | staging
 */

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const localRequire = createRequire(import.meta.url);

function loadRuntimeDependency(name) {
  try {
    return localRequire(name);
  } catch (localError) {
    const runtimeModules = process.env.AIRTRUST_DIAG_NODE_MODULES;
    if (!runtimeModules) {
      throw new Error(
        `Não foi possível localizar ${name}. Defina AIRTRUST_DIAG_NODE_MODULES para um node_modules que contenha as dependências de diagnóstico.`,
        { cause: localError },
      );
    }
    return createRequire(path.join(path.resolve(runtimeModules), 'package.json'))(name);
  }
}

const { chromium } = loadRuntimeDependency('playwright');
const sharp = loadRuntimeDependency('sharp');

const ORIGINS = {
  production: 'https://airtrust.online',
  staging: 'https://staging.airtrust.pages.dev',
};
const originName = process.argv[2];

if (!Object.hasOwn(ORIGINS, originName)) {
  throw new Error('Uso: scorm-origin-runtime-capture.mjs <production|staging>');
}

const runId = `${originName}-${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}`;
const outputDir = path.join(repoRoot, 'output', 'playwright', 'scorm-origin-diagnosis', runId);
const profileDir = path.resolve(
  process.env.AIRTRUST_SCORM_DIAG_PROFILE_DIR || '/tmp/airtrust-scorm-origin-diagnosis-profile',
);
const rawTraceDir = path.join(profileDir, 'raw-traces');
const rawTracePath = path.join(rawTraceDir, `${runId}.zip`);
const playerUrl = `${ORIGINS[originName]}/lms/player/21`;
const sensitiveQueryKeys = /token|auth|jwt|session|secret|password|email/i;
const sensitiveHeaderKeys = /authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-auth/i;
const jwtPattern = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const bearerPattern = /bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const emailPattern = /\b([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const events = [];
const frameIds = new WeakMap();
let nextFrameId = 1;
let inFlightLmsRequests = 0;
let lastObservedMutation = 0;
let previousVisualFrame = null;
let blackCandidate = null;
let activeContext = null;

function highResTimestamp() {
  return {
    epochMs: Date.now(),
    monotonicMs: Number(performance.now().toFixed(3)),
    hrtimeNs: process.hrtime.bigint().toString(),
  };
}

function maskText(value) {
  if (typeof value !== 'string') return value;
  return value
    .replaceAll(jwtPattern, '[REDACTED_JWT]')
    .replaceAll(bearerPattern, 'Bearer [REDACTED]')
    .replaceAll(emailPattern, '$1***@$2');
}

function sanitizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveQueryKeys.test(key)) url.searchParams.delete(key);
    }
    return maskText(url.toString());
  } catch {
    return maskText(value);
  }
}

function sanitizeHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      sensitiveHeaderKeys.test(key)
        ? '[REDACTED]'
        : key.toLowerCase() === 'location'
          ? sanitizeUrl(String(value))
          : maskText(String(value)),
    ]),
  );
}

function sanitizeUnknown(value) {
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map(sanitizeUnknown);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      sensitiveHeaderKeys.test(key)
        ? '[REDACTED]'
        : /(^|_)(url|src|location)(_|$)/i.test(key) && typeof child === 'string'
          ? sanitizeUrl(child)
          : sanitizeUnknown(child),
    ]),
  );
}

function record(type, detail = {}) {
  events.push({ timestamp: highResTimestamp(), type, detail: sanitizeUnknown(detail) });
}

function isLmsRequest(url) {
  return /\/api\/lms\/(?:scorm\/(?:launch|assets|state)|matriculas|cursos)|\/api\/(?:auth|refresh)|telemetr/i.test(url);
}

function frameIdentity(frame) {
  if (!frameIds.has(frame)) frameIds.set(frame, `frame-${nextFrameId++}`);
  return frameIds.get(frame);
}

function frameDetail(frame) {
  const parent = frame.parentFrame();
  return {
    id: frameIdentity(frame),
    name: frame.name() || null,
    url: sanitizeUrl(frame.url()),
    parentId: parent ? frameIdentity(parent) : null,
  };
}

async function writeCandidateFrame(name, jpeg) {
  await writeFile(path.join(outputDir, name), jpeg);
}

async function analyseVisualFrame(jpeg) {
  const { data, info } = await sharp(jpeg)
    .resize({ width: 240, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const xStart = Math.floor(info.width * 0.2);
  const xEnd = Math.ceil(info.width * 0.8);
  const yStart = Math.floor(info.height * 0.18);
  const yEnd = Math.ceil(info.height * 0.82);
  let pixels = 0;
  let blackPixels = 0;
  let whitePixels = 0;
  let luminanceSum = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pixels += 1;
      luminanceSum += luminance;
      if (luminance < 28) blackPixels += 1;
      if (luminance > 225) whitePixels += 1;
    }
  }

  return {
    meanLuminance: Number((luminanceSum / pixels).toFixed(2)),
    blackRatio: Number((blackPixels / pixels).toFixed(4)),
    whiteRatio: Number((whitePixels / pixels).toFixed(4)),
  };
}

async function captureVisualFrame(jpeg) {
  const analysis = await analyseVisualFrame(jpeg);
  const isBlack = analysis.blackRatio >= 0.9;

  if (isBlack && !blackCandidate) {
    blackCandidate = { jpeg, analysis };
    if (previousVisualFrame) await writeCandidateFrame('black-frame-before.jpg', previousVisualFrame.jpeg);
    await writeCandidateFrame('black-frame-detected.jpg', jpeg);
    record('visual.black_frame_detected', analysis);
  } else if (!isBlack && blackCandidate) {
    await writeCandidateFrame('black-frame-after.jpg', jpeg);
    record('visual.black_frame_recovered', { before: blackCandidate.analysis, after: analysis });
    blackCandidate = null;
  }

  previousVisualFrame = { jpeg, analysis };
}

function assertProfileOutsideRepository() {
  const relative = path.relative(repoRoot, profileDir);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('AIRTRUST_SCORM_DIAG_PROFILE_DIR deve ficar fora do repositório.');
  }
}

async function waitForManualLogin() {
  const readline = createInterface({ input, output });
  await readline.question(
    `Faça login manualmente, abra ${playerUrl} na janela Chromium e pressione Enter aqui para armar a captura passiva de ${originName}, sem nova navegação. `,
  );
  readline.close();
}

async function waitForPassiveStability(page) {
  const outerFrame = await waitForFrame(page, (frame) => frame.parentFrame() === page.mainFrame());
  const innerFrame = await waitForFrame(page, (frame) => frame.parentFrame() === outerFrame);
  await innerFrame.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  record('frame.inner_ready', { outer: frameDetail(outerFrame), inner: frameDetail(innerFrame) });

  return page.waitForFunction(
    () => {
      const probe = window.__airtrustScormDiag;
      return Boolean(probe?.outerFrameVisible && probe?.quietAnimationFrames >= 120);
    },
    undefined,
    { timeout: 90_000 },
  );
}

function waitForFrame(page, predicate) {
  const existing = page.frames().find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      page.off('framenavigated', onFrameNavigated);
      reject(new Error('Frame esperado não foi carregado antes do limite de segurança.'));
    }, 90_000);
    const onFrameNavigated = (frame) => {
      if (!predicate(frame)) return;
      clearTimeout(timeout);
      page.off('framenavigated', onFrameNavigated);
      resolve(frame);
    };
    page.on('framenavigated', onFrameNavigated);
  });
}

function validateSanitizedLog(serialized) {
  const findings = {
    jwt: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(serialized),
    bearerValue: /bearer\s+(?!\[REDACTED\])/i.test(serialized),
    rawAssetCookie: /airtrust_lms_asset_token=[^\[\s,}]+/i.test(serialized),
    fullEmail: /\b[A-Z0-9._%+-]{2,}@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(serialized),
  };
  return { findings, safe: !Object.values(findings).some(Boolean) };
}

async function main() {
  assertProfileOutsideRepository();
  await Promise.all([
    mkdir(outputDir, { recursive: true }),
    mkdir(path.join(outputDir, 'video'), { recursive: true }),
    mkdir(rawTraceDir, { recursive: true }),
  ]);

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
    recordVideo: { dir: path.join(outputDir, 'video'), size: { width: 1440, height: 960 } },
    args: ['--disable-save-password-bubble', '--disable-features=PasswordManagerOnboarding,PasswordManagerEnabled'],
  });
  activeContext = context;
  const page = context.pages()[0] || (await context.newPage());
  const cdp = await context.newCDPSession(page);

  await context.exposeBinding('airtrustScormDiagEvent', (_source, type, detail) => {
    lastObservedMutation = performance.now();
    record(`dom.${type}`, detail);
  });
  await page.addInitScript(() => {
    const documentInstance = `doc-${Math.random().toString(36).slice(2, 10)}`;
    const safeDocumentUrl = () => {
      try {
        const url = new URL(location.href);
        for (const key of [...url.searchParams.keys()]) {
          if (/token|auth|jwt|session|secret/i.test(key)) url.searchParams.delete(key);
        }
        return url.toString();
      } catch {
        return '[UNAVAILABLE]';
      }
    };
    const snapshot = () => {
      const outer = document.querySelector('iframe');
      const inner = document.querySelector('#scorm-frame');
      const target = document.elementFromPoint(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2));
      const status = document.getElementById('status-text')?.textContent?.trim() || null;
      const loadingOverlay = [...document.querySelectorAll('p')].some((node) =>
        node.textContent?.includes('Montando o ambiente do curso'),
      );
      const frameData = (frame) => {
        if (!frame) return null;
        const style = getComputedStyle(frame);
        const rect = frame.getBoundingClientRect();
        const rawSrc = frame.getAttribute('src') || '';
        return {
          id: frame.id || null,
          src: (() => {
            try {
              const url = new URL(rawSrc, location.href);
              for (const key of [...url.searchParams.keys()]) {
                if (/token|auth|jwt|session|secret/i.test(key)) url.searchParams.delete(key);
              }
              return url.toString();
            } catch {
              return '[UNAVAILABLE]';
            }
          })(),
          connected: frame.isConnected,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          readyState: frame.contentDocument?.readyState ?? null,
        };
      };
      return {
        documentInstance,
        documentUrl: safeDocumentUrl(),
        outer: frameData(outer),
        inner: frameData(inner),
        status,
        loadingOverlay,
        center: target
          ? {
              tag: target.tagName,
              id: target.id || null,
              className: typeof target.className === 'string' ? target.className : null,
              background: getComputedStyle(target).backgroundColor,
            }
          : null,
      };
    };
    const emit = (type, detail) => globalThis.airtrustScormDiagEvent?.(type, detail);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target;
        const isFrame = target instanceof HTMLIFrameElement;
        if (isFrame || [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof HTMLIFrameElement)) {
          emit('iframe_mutation', { mutation: record.type, attribute: record.attributeName || null, state: snapshot() });
        }
      }
    });
    const install = () => {
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style', 'class'] });
      document.addEventListener('visibilitychange', () => emit('visibility', { state: document.visibilityState, snapshot: snapshot() }));
      window.addEventListener('beforeunload', () => emit('beforeunload', { snapshot: snapshot() }));
      document.addEventListener(
        'load',
        (event) => {
          const target = event.target;
          if (target instanceof HTMLIFrameElement) {
            emit('iframe_load', { id: target.id || null, src: target.getAttribute('src') || null, snapshot: snapshot() });
          }
        },
        true,
      );
      window.addEventListener('message', (event) => {
        const data = event.data;
        emit('post_message', {
          origin: event.origin,
          type: data && typeof data === 'object' && typeof data.type === 'string' ? data.type : null,
          snapshot: snapshot(),
        });
      });
      let prior = '';
      let quietAnimationFrames = 0;
      let previousStatus = null;
      const sample = () => {
        const state = snapshot();
        if (state.status !== previousStatus) {
          previousStatus = state.status;
          emit('status_change', { status: state.status, snapshot: state });
        }
        const fingerprint = JSON.stringify(state);
        if (fingerprint !== prior) {
          quietAnimationFrames = 0;
          prior = fingerprint;
          emit('raf_state_change', state);
        } else {
          quietAnimationFrames += 1;
        }
        window.__airtrustScormDiag = {
          outerFrameVisible: Boolean(state.outer && state.outer.connected && state.outer.visibility !== 'hidden' && state.outer.display !== 'none'),
          innerFrameConnected: Boolean(state.inner && state.inner.connected),
          quietAnimationFrames,
        };
        requestAnimationFrame(sample);
      };
      emit('instrumentation_ready', snapshot());
      requestAnimationFrame(sample);
    };
    if (document.documentElement) install();
    else document.addEventListener('DOMContentLoaded', install, { once: true });
  });

  page.on('console', (message) => record('page.console', { level: message.type(), text: message.text(), url: sanitizeUrl(page.url()) }));
  page.on('pageerror', (error) => record('page.error', { message: error.message, stack: error.stack }));
  page.on('request', (request) => {
    if (isLmsRequest(request.url())) inFlightLmsRequests += 1;
    record('network.request', {
      method: request.method(),
      resourceType: request.resourceType(),
      url: sanitizeUrl(request.url()),
      headers: sanitizeHeaders(request.headers()),
      frame: frameDetail(request.frame()),
    });
  });
  page.on('response', async (response) => {
    const request = response.request();
    if (isLmsRequest(request.url())) inFlightLmsRequests = Math.max(0, inFlightLmsRequests - 1);
    record('network.response', {
      status: response.status(),
      url: sanitizeUrl(response.url()),
      headers: sanitizeHeaders(await response.allHeaders()),
      fromServiceWorker: response.fromServiceWorker(),
      frame: frameDetail(request.frame()),
    });
  });
  page.on('requestfailed', (request) => {
    if (isLmsRequest(request.url())) inFlightLmsRequests = Math.max(0, inFlightLmsRequests - 1);
    record('network.request_failed', { url: sanitizeUrl(request.url()), failure: request.failure(), frame: frameDetail(request.frame()) });
  });
  page.on('websocket', (socket) => record('network.websocket', { url: sanitizeUrl(socket.url()) }));
  page.on('worker', (worker) => record('worker.created', { url: sanitizeUrl(worker.url()) }));
  context.on('serviceworker', (worker) => record('service_worker.created', { url: sanitizeUrl(worker.url()) }));
  page.on('frameattached', (frame) => record('frame.attached', frameDetail(frame)));
  page.on('framedetached', (frame) => record('frame.detached', frameDetail(frame)));
  page.on('framenavigated', (frame) => record('frame.navigated', frameDetail(frame)));

  await cdp.send('Page.enable');
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId });
    void captureVisualFrame(Buffer.from(data, 'base64')).catch((error) => record('visual.analysis_error', { message: error.message }));
  });

  await page.goto(ORIGINS[originName], { waitUntil: 'domcontentloaded' });
  await waitForManualLogin();
  const currentUrl = new URL(page.url());
  if (currentUrl.origin !== ORIGINS[originName] || currentUrl.pathname !== '/lms/player/21') {
    throw new Error(`A página observada deve permanecer em ${playerUrl}; URL atual: ${sanitizeUrl(page.url())}`);
  }
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: 1440, maxHeight: 960, everyNthFrame: 1 });
  record('capture.passive_observation_started', { origin: originName, playerUrl: sanitizeUrl(playerUrl) });
  await waitForPassiveStability(page);
  record('capture.passive_stability_confirmed', { inFlightLmsRequests, msSinceLastDomEvent: Number((performance.now() - lastObservedMutation).toFixed(3)) });

  await cdp.send('Page.stopScreencast');
  await context.tracing.stop({ path: rawTracePath });

  const cookieMetadata = (await context.cookies()).map((cookie) => ({
    name: `${cookie.name.slice(0, 3)}***`,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expires: cookie.expires,
    partitionKey: cookie.partitionKey ?? null,
  }));
  record('cookie.metadata', { cookies: cookieMetadata });

  const sanitizedLog = {
    schemaVersion: 1,
    origin: originName,
    playerUrl: sanitizeUrl(playerUrl),
    rawTraceLocalOnly: rawTracePath,
    events,
  };
  const serialized = JSON.stringify(sanitizedLog, null, 2);
  const validation = validateSanitizedLog(serialized);
  await writeFile(path.join(outputDir, 'sanitization-validation.json'), JSON.stringify(validation, null, 2));
  if (!validation.safe) throw new Error('A validação encontrou possível segredo no log sanitizado; o arquivo não deve ser compartilhado.');
  await writeFile(path.join(outputDir, 'events.sanitized.json'), serialized);

  const video = page.video();
  await context.close();
  activeContext = null;
  const videoPath = video ? await video.path().catch(() => null) : null;
  await writeFile(
    path.join(outputDir, 'README.txt'),
    [
      `Origem: ${originName}`,
      `Eventos sanitizados: events.sanitized.json`,
      `Validação: sanitization-validation.json`,
      `Vídeo: ${videoPath ? path.basename(videoPath) : 'gerado em video/ após fechamento do contexto'}`,
      'Trace bruto: mantido somente fora do repositório no perfil persistente; não anexar nem versionar.',
    ].join('\n') + '\n',
  );
  output.write(`Captura sanitizada concluída: ${outputDir}\n`);
}

main().catch(async (error) => {
  record('capture.fatal_error', { message: error.message });
  await activeContext?.close().catch(() => undefined);
  activeContext = null;
  if (existsSync(outputDir)) {
    await writeFile(path.join(outputDir, 'failure.sanitized.json'), JSON.stringify({ events }, null, 2));
  }
  process.stderr.write(`Falha na captura: ${maskText(error.message)}\n`);
  process.exitCode = 1;
});
