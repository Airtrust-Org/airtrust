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
  assert.match(html, /NÃO CONCEDIDA/);
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


/** DOM stub drives the real inline script and reproduces rendered role states.
 * Only the offline demo is evaluated; no browser, network or D1 involved.
 */
function simulateBrowserDemo() {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const root = { innerHTML: '', querySelectorAll() { return []; } };
  const heading = { textContent: '' }, crumb = { textContent: '' };
  const roleControl = {
    value: 'admin', handlers: {},
    addEventListener(type, cb) { this.handlers[type] = cb; },
  };
  const views = ['visao', 'equipe', 'casos', 'relatorio', 'metodo', 'roteiro'];
  const navigation = views.map(view => ({
    dataset: { view }, handlers: {},
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(type, cb) { this.handlers[type] = cb; },
  }));
  const nodes = { content: root, heading, crumb, role: roleControl };
  const document = {
    getElementById(id) { return nodes[id] || null; },
    querySelectorAll(selector) { return selector === '.nav-btn' ? navigation : []; },
  };
  new Script(scripts[0][1], { filename: 'boa-demo-offline-inline.js' })
    .runInNewContext({ document });
  return {
    html: () => root.innerHTML,
    setRole(nextRole) {
      assert.ok(['admin', 'gestor', 'tripulante'].includes(nextRole));
      roleControl.value = nextRole;
      roleControl.handlers.change();
    },
    go(view) {
      const node = navigation.find(x => x.dataset.view === view);
      assert.ok(node, view);
      node.handlers.click();
    },
  };
}

test('offline visual roles match BOA backend boundaries (not real RBAC)', () => {
  const demo = simulateBrowserDemo();
  demo.go('equipe');
  assert.match(demo.html(), /130 registros visíveis/);
  assert.match(demo.html(), /TRIPULANTE TOTALMENTE FICTÍCIO 130/);
  demo.go('casos');
  assert.match(demo.html(), /O administrador vê apenas contagens agregadas|A visualização administrativa resume apenas contagens agregadas/);
  assert.doesNotMatch(demo.html(), /BOA-DEMO-202610-001|Relato sintético de sono:/);
  demo.go('relatorio');
  assert.match(demo.html(), /Prévia mensal gerencial e técnica/);
  assert.match(demo.html(), /180/);

  demo.setRole('gestor');
  demo.go('equipe');
  assert.match(demo.html(), /cadastro completo de funcionários é reservado ao administrador/);
  assert.doesNotMatch(demo.html(), /TRIPULANTE TOTALMENTE FICTÍCIO 001/);
  demo.go('casos');
  assert.match(demo.html(), /setor Alfa/);
  assert.match(demo.html(), /BOA-DEMO-202610-001/);
  assert.doesNotMatch(demo.html(), /Relato sintético de sono:|KSS ilustrativa:|PVT|TRIPULANTE TOTALMENTE FICTÍCIO/);
  demo.go('relatorio');
  assert.match(demo.html(), /Relatórios administrativos não fazem parte/);
  demo.go('metodo');
  assert.match(demo.html(), /visualização administrativa/);

  demo.setRole('tripulante');
  demo.go('visao');
  assert.match(demo.html(), /Meu recibo fictício de check-in/);
  assert.match(demo.html(), /DEMO-001/);
  assert.match(demo.html(), /06\/10\/2026/);
  assert.doesNotMatch(demo.html(), /BOA-DEMO-202610-001|Relato sintético de sono:|KSS ilustrativa:/);
  demo.go('equipe');
  assert.match(demo.html(), /cadastro completo de funcionários é reservado ao administrador/);
  demo.go('casos');
  assert.match(demo.html(), /fila de ocorrências e o detalhamento gerencial não são disponibilizados ao tripulante/);
  assert.doesNotMatch(demo.html(), /BOA-DEMO-202610-001/);
  demo.go('relatorio');
  assert.match(demo.html(), /Relatórios administrativos não fazem parte/);
  demo.go('metodo');
  assert.match(demo.html(), /visualização administrativa/);
});
