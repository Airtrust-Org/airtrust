/**
 * Homologação autenticada de checks individuais de Simuladores — Frente 7 (issue #1548).
 *
 * Pré-requisitos (fornecidos pelo workflow, nunca por credencial pessoal):
 *  - Schema V2 0554 + 0560 aplicados fisicamente no D1 de staging e Worker/frontend implantados com o SHA candidato.
 *  - Fixture sintético semeado por scripts/staging/seed-qa-simulator-individual-check.mjs
 *    (manifesto JSON com IDs numéricos em SIM_QA_MANIFEST_FILE).
 *  - Login QA sintético do tenant qa_examiner_training (QA_ADMIN_EMAIL/QA_ADMIN_PASSWORD).
 *
 * Cenários (cada um com asserções de UI, API e persistência — nunca somente toast de sucesso):
 *  A  assinatura pelo MODAL, check aprovado        → APROVADO + FAP + validade + PDF
 *  B  assinatura INLINE com sessão APROVADA mas check REPROVADO → REPROVADO, sem FAP ativa,
 *     FAP prematura revogada (soft) e nunca convertida em aprovação
 *  C  sem avaliação individual                     → PENDENTE, sem FAP/certificado
 *  D  ficha finalizada: "Confirmar resultados individuais" com falha de rede + retry
 *
 * Nenhum dado real de tripulante é utilizado; nada aqui é um mock de navegador: todas as respostas vêm do Worker
 * e do D1 físicos de staging.
 */
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Scenario = 'A' | 'B' | 'C' | 'D';
type Fixture = { cenario: Scenario; ficha_id: number; funcionario_id: number; sessao_check_id: number };

const API = (process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev').replace(/\/$/, '');
if (/airtrust-api(-production)?\.airtrust\.workers\.dev$/i.test(new URL(API).hostname) ||
    /airtrust\.online$/i.test(new URL(API).hostname)) {
  throw new Error('PRODUCTION_API_TARGET_REJECTED');
}
const QA_EMAIL = process.env.QA_ADMIN_EMAIL || '';
const QA_PASSWORD = process.env.QA_ADMIN_PASSWORD || '';
const OTHER_EMAIL = process.env.E2E_EMAIL || '';
const OTHER_PASSWORD = process.env.E2E_PASSWORD || '';
const CODE = process.env.QA_SIM_IND_CODE || '';
const manifestFile = process.env.SIM_QA_MANIFEST_FILE || '';

const fixtures = (() => {
  if (!manifestFile) return {} as Record<Scenario, Fixture>;
  const parsed = JSON.parse(readFileSync(manifestFile, 'utf8')) as { fichas: Fixture[] };
  return Object.fromEntries(parsed.fichas.map((f) => [f.cenario, f])) as Record<Scenario, Fixture>;
})();

async function doLoginOnce(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /entrar|sign in/i }).click();

  // O app pode navegar diretamente ou renderizar o seletor de perfil operacional
  // ("Como você quer entrar?"). Aguardamos até 30s por um dos dois estados.
  await page.waitForFunction(
    () => {
      if (!window.location.pathname.startsWith('/login')) return true;
      return Array.from(document.querySelectorAll('button')).some((b) =>
        /^Entrar como/i.test((b.textContent || '').trim()),
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  // Se ainda estiver em /login com perfil operacional disponível, seleciona perfil de administrador/gestor:
  if (new URL(page.url()).pathname.startsWith('/login')) {
    const profileButton = page
      .getByRole('button', { name: /entrar como (administrador(?: geral| da empresa)?|gestor)/i })
      .or(page.locator('button', { hasText: /Entrar como/i }))
      .first();
    if (await profileButton.isVisible()) {
      await profileButton.click();
    }
  }

  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

async function login(page: Page, email: string, password: string) {
  if (!email || !password) {
    throw new Error(`LOGIN_CREDENTIALS_MISSING: email=${Boolean(email)} password=${Boolean(password)}`);
  }
  try {
    await doLoginOnce(page, email, password);
  } catch (err) {
    console.warn('[qa-homologation] login retry after failure:', err);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await doLoginOnce(page, email, password);
  }
}

/** Reaproveita exatamente a autenticação que o próprio app envia ao Worker (bearer e/ou cookie). */
function captureAuth(page: Page): { header: () => string | null } {
  let bearer: string | null = null;
  page.on('request', (req) => {
    if (req.url().startsWith(API)) {
      const h = req.headers()['authorization'];
      if (h) bearer = h;
    }
  });
  return { header: () => bearer };
}

async function api(page: Page, auth: { header: () => string | null }, method: 'GET' | 'POST' | 'DELETE', path: string, data?: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const bearer = auth.header();
  if (bearer) headers.authorization = bearer;
  const res = await (page.request as APIRequestContext).fetch(`${API}${path}`, {
    method, headers, data: data === undefined ? undefined : JSON.stringify(data), failOnStatusCode: false,
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* corpo não JSON (ex.: PDF) */ }
  return { status: res.status(), body, contentType: res.headers()['content-type'] || '' };
}

async function draw(page: Page, scope: ReturnType<Page['locator']>) {
  const canvas = scope.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('SIGNATURE_CANVAS_NOT_VISIBLE');
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width - 30, box.y + 40, { steps: 8 });
  await page.mouse.up();
}

/** Percorre o JSON em qualquer formato procurando linhas da FAP do check sintético ainda ATIVAS. */
function activeFapRows(payload: unknown, code: string): Array<Record<string, any>> {
  const found: Array<Record<string, any>> = [];
  const walk = (node: any) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const mentionsCode = Object.values(node).some((v) => typeof v === 'string' && v.includes(`${code}-CHK`));
      const status = String(node.status || '').toUpperCase();
      if (mentionsCode && !node.deleted_at && !['CANCELADA', 'CANCELADO'].includes(status)) found.push(node);
      Object.values(node).forEach(walk);
    }
  };
  walk(payload);
  return found;
}

const evidenceFor = (body: any) => (body?.data ?? [])[0] ?? {};

test.describe.configure({ mode: 'serial' });

test.describe('Frente 7 — homologação staging: checks individuais de Simuladores', () => {
  test.skip(!manifestFile || !CODE || !QA_EMAIL || !QA_PASSWORD, 'Fixture/credencial sintética ausente: executar via workflow governado.');

  let context: BrowserContext;
  let page: Page;
  let auth: { header: () => string | null };

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    auth = captureAuth(page);
    await login(page, QA_EMAIL, QA_PASSWORD);
    await page.goto('/simuladores/fichas', { waitUntil: 'domcontentloaded' });
  });
  test.afterAll(async () => { await context?.close(); });

  const checksPath = (s: Scenario) => `/api/simuladores/fichas/${fixtures[s].ficha_id}/checks-individuais`;
  const history = (s: Scenario) => `/api/qualificacoes/funcionario/${fixtures[s].funcionario_id}`;

  test('estado inicial: todas as fichas sintéticas começam PENDENTES (nada é inferido)', async () => {
    for (const s of ['A', 'B', 'C', 'D'] as Scenario[]) {
      const r = await api(page, auth, 'GET', checksPath(s));
      expect(r.status, `GET inicial ${s}`).toBe(200);
      expect(evidenceFor(r.body)).toMatchObject({ situacao: 'PENDENTE_AVALIACAO', aprovado_comprovado: false });
    }
    // B nasce com uma FAP prematura indevida (cenário de revogação).
    const hist = await api(page, auth, 'GET', history('B'));
    expect(hist.status).toBe(200);
    expect(activeFapRows(hist.body, CODE).length).toBeGreaterThanOrEqual(1);
  });

  test('A — APROVADO pelo modal: UI + API + persistência + FAP + validade + PDF', async () => {
    const f = fixtures.A;
    await page.goto(`/simuladores/fichas/${f.ficha_id}`, { waitUntil: 'domcontentloaded' });
    const abrir = page.getByRole('button', { name: /^Assinar$/ }).last();
    await abrir.waitFor({ state: 'visible', timeout: 30_000 });
    await abrir.click();
    const modal = page.locator('div.fixed.inset-0').filter({ hasText: 'Assinatura Digital' });
    await expect(modal).toBeVisible();
    await draw(page, modal);
    await modal.locator('#concordo').check();
    await modal.getByRole('button', { name: /✓ APROVADO/ }).click();
    await modal.locator(`input[name="check-${f.sessao_check_id}"]`).first().check(); // ✓ Aprovado
    const save = page.waitForResponse((r) => r.url().includes(`/fichas/${f.ficha_id}/checks-individuais`) && r.request().method() === 'POST');
    await modal.getByRole('button', { name: /Confirmar Assinatura/ }).click();
    expect([200, 201]).toContain((await save).status());

    // API: evidência confirmada, imutável e com validade.
    const r = await api(page, auth, 'GET', checksPath('A'));
    expect(evidenceFor(r.body)).toMatchObject({ situacao: 'APROVADO', aprovado_comprovado: true });
    expect(String(evidenceFor(r.body).data_vencimento)).toMatch(/^\d{4}-\d{2}-\d{2}/);

    // UI após recarregar (persistência real).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Evidências individuais dos checks')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('APROVADO', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Evidência imutável')).toBeVisible({ timeout: 30_000 });

    // FAP / Qualificações e PDF coerentes com a mesma evidência.
    const hist = await api(page, auth, 'GET', history('A'));
    const rows = activeFapRows(hist.body, CODE);
    expect(rows.length, 'FAP ativa da ficha A').toBeGreaterThanOrEqual(1);
    const pdf = await api(page, auth, 'POST', `/api/simuladores/fichas/${f.ficha_id}/pdf`);
    expect(pdf.status).toBe(200);
  });

  test('B — REPROVADO pelo inline com sessão APROVADA: sem aprovação coletiva e FAP prematura revogada', async () => {
    const f = fixtures.B;
    await page.goto(`/simuladores/fichas/${f.ficha_id}?mode=sign&papel=INSTRUTOR`, { waitUntil: 'domcontentloaded' });
    await page.locator('#concordo').waitFor({ state: 'visible', timeout: 30_000 });
    await draw(page, page.locator('body'));
    await page.locator('#concordo').check();
    await page.locator('input[name="aprovacao"]').first().check(); // sessão APROVADA (cenário perigoso)
    await page.locator(`input[name="inline-check-${f.sessao_check_id}"]`).nth(1).check(); // ✗ Reprovado
    const save = page.waitForResponse((r) => r.url().includes(`/fichas/${f.ficha_id}/checks-individuais`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Confirmar Assinatura como Instrutor|Assinar e Gerar Qualificação/ }).click();
    expect([200, 201]).toContain((await save).status());

    const r = await api(page, auth, 'GET', checksPath('B'));
    expect(evidenceFor(r.body)).toMatchObject({ situacao: 'REPROVADO', aprovado_comprovado: false });

    await page.goto(`/simuladores/fichas/${f.ficha_id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Evidências individuais dos checks')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('REPROVADO', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Evidência imutável')).toBeVisible({ timeout: 30_000 });

    // Nenhuma FAP ativa; a prematura foi revogada (não apagada) — a linha cancelada permanece auditável.
    const hist = await api(page, auth, 'GET', history('B'));
    expect(activeFapRows(hist.body, CODE)).toEqual([]);
  });

  test('C — PENDENTE: sem avaliação individual não há aprovação, FAP ou certificado', async () => {
    await page.goto(`/simuladores/fichas/${fixtures.C.ficha_id}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('PENDENTE DE AVALIAÇÃO').first()).toBeVisible({ timeout: 30_000 });
    const r = await api(page, auth, 'GET', checksPath('C'));
    expect(evidenceFor(r.body)).toMatchObject({ situacao: 'PENDENTE_AVALIACAO', aprovado_comprovado: false });
    const hist = await api(page, auth, 'GET', history('C'));
    expect(activeFapRows(hist.body, CODE)).toEqual([]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('PENDENTE DE AVALIAÇÃO').first()).toBeVisible({ timeout: 30_000 });
  });

  test('D — ficha finalizada: erro de rede não grava evidência; retry grava uma única vez', async () => {
    const f = fixtures.D;
    await page.goto(`/simuladores/fichas/${f.ficha_id}`, { waitUntil: 'domcontentloaded' });
    const aprovadoBtn = page.getByRole('button', { name: 'Aprovado', exact: true }).first();
    await aprovadoBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await aprovadoBtn.click();

    // 1ª tentativa: a rede falha antes de a resposta chegar.
    let aborted = false;
    await page.route(`**/fichas/${f.ficha_id}/checks-individuais`, async (route) => {
      if (route.request().method() === 'POST' && !aborted) { aborted = true; await route.abort('failed'); return; }
      await route.continue();
    });
    await page.getByRole('button', { name: 'Confirmar resultados individuais' }).click();
    await expect.poll(() => aborted).toBe(true);
    const mid = await api(page, auth, 'GET', checksPath('D'));
    expect(evidenceFor(mid.body)).toMatchObject({ situacao: 'PENDENTE_AVALIACAO' });

    // Retry pela UI: agora grava.
    const save = page.waitForResponse((r) => r.url().includes(`/fichas/${f.ficha_id}/checks-individuais`) && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Aprovado', exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirmar resultados individuais' }).click();
    expect([200, 201]).toContain((await save).status());
    await page.unroute(`**/fichas/${f.ficha_id}/checks-individuais`);

    const end = await api(page, auth, 'GET', checksPath('D'));
    expect(evidenceFor(end.body)).toMatchObject({ situacao: 'APROVADO', aprovado_comprovado: true });
  });

  test('segurança: dupla submissão, assinatura duplicada, contradição, DELETE físico e imutabilidade', async () => {
    const A = fixtures.A;
    const same = { sessao_check_id: A.sessao_check_id, aprovado: true };
    const dup = await api(page, auth, 'POST', checksPath('A'), same);
    expect([200, 409]).toContain(dup.status); // idempotente, nunca um 2º 201
    const contradiction = await api(page, auth, 'POST', checksPath('A'), { ...same, aprovado: false });
    expect(contradiction.status).toBe(409);
    const after = await api(page, auth, 'GET', checksPath('A'));
    expect(evidenceFor(after.body)).toMatchObject({ situacao: 'APROVADO' });
    const del = await api(page, auth, 'DELETE', checksPath('A'));
    expect([404, 405]).toContain(del.status);
    // Concorrência: duas submissões simultâneas sobre a ficha B (já reprovada) não criam evidência nova.
    const B = fixtures.B;
    const race = await Promise.all([1, 2].map(() =>
      api(page, auth, 'POST', checksPath('B'), { sessao_check_id: B.sessao_check_id, aprovado: true })));
    expect(race.every((x) => x.status === 409)).toBe(true);
    const b = await api(page, auth, 'GET', checksPath('B'));
    expect(evidenceFor(b.body)).toMatchObject({ situacao: 'REPROVADO' });
  });

  test('persistência em nova sessão: novo contexto/login reproduz A aprovado, B reprovado, C pendente', async ({ browser }) => {
    const fresh = await browser.newContext();
    const p = await fresh.newPage();
    const a = captureAuth(p);
    await login(p, QA_EMAIL, QA_PASSWORD);
    await p.goto('/simuladores/fichas', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => a.header(), { timeout: 15_000 }).not.toBeNull();
    const expected: Record<Scenario, string> = { A: 'APROVADO', B: 'REPROVADO', C: 'PENDENTE_AVALIACAO', D: 'APROVADO' };
    for (const s of ['A', 'B', 'C', 'D'] as Scenario[]) {
      const r = await api(p, a, 'GET', checksPath(s));
      expect(evidenceFor(r.body).situacao, `cenário ${s} em nova sessão`).toBe(expected[s]);
    }
    await fresh.close();
  });

  test('RBAC/cross-tenant: outra identidade QA não lê nem grava evidência deste fixture', async ({ browser }) => {
    test.skip(!OTHER_EMAIL || !OTHER_PASSWORD, 'Identidade QA geral não disponível neste run.');
    const other = await browser.newContext();
    const p = await other.newPage();
    const a = captureAuth(p);
    await login(p, OTHER_EMAIL, OTHER_PASSWORD);
    await p.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => a.header(), { timeout: 15_000 }).not.toBeNull();
    const read = await api(p, a, 'GET', checksPath('A'));
    expect([401, 403, 404]).toContain(read.status);
    const write = await api(p, a, 'POST', checksPath('C'), { sessao_check_id: fixtures.C.sessao_check_id, aprovado: true });
    expect([401, 403, 404]).toContain(write.status);
    // E sem nenhuma evidência foi criada para C.
    const c = await api(page, auth, 'GET', checksPath('C'));
    expect(evidenceFor(c.body)).toMatchObject({ situacao: 'PENDENTE_AVALIACAO' });
    await other.close();
  });
});
