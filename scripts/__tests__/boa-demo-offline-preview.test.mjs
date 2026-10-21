/**
 * BOA tender demo HTML safety: offline-only. No network, credentials or D1 access.
 * source_reference: docs/frms/BOA_DEMO_INTERATIVA_OFFLINE_20261021.html
 * operational_decision: Static public demonstration is not an authenticated QA.
 * dry_run_required: Node reads local HTML only, no DB or network.
 * rollback_plan_required: No persistent data is modified.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const html = readFileSync(
  new URL('../../docs/frms/BOA_DEMO_INTERATIVA_OFFLINE_20261021.html', import.meta.url),
  'utf8',
);

test('BOA preview is self-contained, compilable and explicitly not a live staging application', () => {
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /DEMO LOCAL • NÃO HOMOLOGADA/);
  assert.match(html, /não é a aplicação conectada ao Cloudflare/);
  assert.match(html, /Troque para o perfil simulado/);
  assert.match(html, /TRIPULANTE TOTALMENTE FICTÍCIO/);
  assert.match(html, /setembro e outubro de 2026/);
  assert.match(html, /NÃO CONCEDIDO/);
  assert.match(html, /Prévia mensal gerencial e técnica/);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'Only one inline script, with no external runtime');
  assert.ok(!/<script[^>]*\bsrc\s*=/i.test(html));
  assert.ok(!/<link[^>]*\brel\s*=\s*["']?stylesheet/i.test(html));
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(scripts[0][1], /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
  assert.doesNotMatch(scripts[0][1], /\b(localStorage|sessionStorage|document\.cookie|eval)\b/);
  assert.doesNotMatch(scripts[0][1], /(?:\bPOST\b|\bPUT\b|\bDELETE\b|wrangler\s+d1)/);
  new Script(scripts[0][1], { filename: 'boa-demo-offline-inline.js' });
});

test('BOA preview contains the same fictitious month/crew/state contracts', () => {
  assert.match(html, /length:130/);
  assert.match(html, /"2026-09":\{count:100,extra:0\}/);
  assert.match(html, /"2026-10":\{count:120,extra:60\}/);
  assert.match(html, /"ABERTO","EM_TRATAMENTO","RESOLVIDO"/);
  assert.match(html, /role==="gestor"/);
  assert.match(html, /role==="tripulante"/);
  assert.match(html, /role!=="admin"/);
});
