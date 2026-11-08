/**
 * E2E de browser SINTETICO: estudo concluido -> prova -> consulta -> reprova -> nova tentativa
 * -> aprova -> finalizar -> qualificacao/certificado -> reabertura sem perda de evidencias.
 *
 * REAL: frontend (LmsPlayer CTA, LmsProva), rotas Hono de producao, regras de prova/finalizacao,
 * SQLite com DDL real, JWT HS256. SIMULADO: /api/auth/*, R2, PDF (Browser Rendering), SCORM assets.
 * Nenhuma aprovacao operacional, D1/R2/Cloudflare remoto ou dado real. Ver server.ts.
 */
import { expect, test, type Page } from '@playwright/test';

const API = 'http://127.0.0.1:8787';
const MATRICULA = 10;
const EMAIL = 'aluno@sintetico.test';

type Evidence = {
  matricula: { status: string; progresso_pct: number; qualificacao_historico_id: number | null; data_conclusao: string | null };
  attempts: Array<{ attempt_no: number; state: string; passed: number | null }>;
  historico: Array<{ id: number; status: string; numero_certificado: string | null; validacao_hash: string | null; certificado_arquivo_id: number | null; lms_matricula_id: number }>;
  documentos: number; r2Objects: number; renders: number;
};

async function reset(page: Page): Promise<string> {
  const res = await page.request.post(`${API}/__test/reset`, { data: {} });
  expect(res.ok()).toBe(true);
  return (await res.json()).password as string;
}
const evidence = async (page: Page) => (await (await page.request.get(`${API}/__test/evidence`)).json()) as Evidence;

async function login(page: Page, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Marca a opcao por texto; aguarda o servidor confirmar o salvamento (UI trava durante o PUT). */
async function choose(page: Page, n: number, text: 'Certa' | 'Errada') {
  const group = page.getByRole('group', { name: new RegExp(`Pergunta ${n}\\?`) });
  await group.getByLabel(text, { exact: true }).check();
  await expect(group.getByLabel(text, { exact: true })).toBeChecked();
  await expect(page.getByRole('status').filter({ hasText: 'Resposta salva.' })).toBeVisible();
}
async function sendExam(page: Page) {
  await page.getByRole('button', { name: 'Enviar prova' }).click();
  await page.getByRole('button', { name: 'Confirmar envio' }).click();
}

test('prova LMS: estudo -> reprova -> nova tentativa -> aprova -> finalizar -> certificado -> reabertura', async ({ page }) => {
  // This learning-flow fixture uses Portuguese labels. Fix the browser
  // locale before navigation so auto-locale/i18n requests cannot race
  // unrelated SCORM assertions in WebKit. Translation API is exercised
  // separately by the HTTP/CORS contract probe below.
  await page.addInitScript(() => {
    if (window.location.origin === 'http://127.0.0.1:3000') {
      window.localStorage.setItem('airtrust:language:manual', 'pt-BR');
    }
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  // Translation is provided by the disposable local API. Browser routing
  // can bypass CORS preflight in Chromium but fail nondeterministically in WebKit.
  // The browser uses the real API origin for i18n. The local synthetic API,
  // not a browser-level route mock, must respond with production-like CORS.
  const translation = await page.request.post(API + '/api/public/translate', {
    headers: { Origin: 'http://127.0.0.1:3000' },
    data: { text: 'Saudações', from: 'pt', to: 'en' },
  });
  expect(translation.status()).toBe(200);
  expect(translation.headers()['access-control-allow-credentials']).toBe('true');
  expect(await translation.json()).toEqual({
    success: true, data: { translatedText: '' },
  });
  // Synthetic browser E2E must support real cross-origin credentialed
  // requests, otherwise WebKit may raise CORS errors after navigation.
  const preflight = await page.request.fetch(API + '/api/lms/matriculas/minhas-ead', {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://127.0.0.1:3000',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    },
  });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:3000');
  expect(preflight.headers()['access-control-allow-credentials']).toBe('true');
  const untrustedPreflight = await page.request.fetch(API + '/api/lms/matriculas/minhas-ead', {
    method: 'OPTIONS',
    headers: { Origin: 'https://example.invalid', 'Access-Control-Request-Method': 'GET' },
  });
  expect(untrustedPreflight.status()).toBe(204);
  expect(untrustedPreflight.headers()['access-control-allow-origin']).not.toBe('https://example.invalid');
  expect(untrustedPreflight.headers()['access-control-allow-credentials']).toBeUndefined();
  const password = await reset(page);

  // 0) estado inicial: nada emitido
  let ev = await evidence(page);
  expect(ev.matricula.status).toBe('EM_ANDAMENTO');
  expect(ev.historico).toHaveLength(0);
  expect(ev.r2Objects).toBe(0);

  // 1) login sintetico (UI) e player com estudo concluido: CTA da prova final
  await login(page, password);
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await page.goto(`/lms/player/${MATRICULA}`);
  const cta = page.getByTestId('lms-open-exam');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveText('Ir para a prova final');
  await cta.click();
  await expect(page).toHaveURL(new RegExp(`/lms/provas/${MATRICULA}$`));

  // 2) prova liberada pelo servidor; inicia tentativa 1
  await expect(page.getByText('Estudo concluído.')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar prova' }).click();
  await expect(page.getByRole('form', { name: 'Tentativa 1' })).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(20);

  // 3) responde 3 questoes, consulta o conteudo (consulta permitida) e retoma sem perder respostas
  for (const n of [1, 2, 3]) await choose(page, n, 'Certa');
  await page.getByRole('link', { name: 'Voltar ao treinamento' }).click();
  await expect(page).toHaveURL(new RegExp(`/lms/player/${MATRICULA}$`));
  await page.getByTestId('lms-open-exam').click();
  await expect(page.getByRole('button', { name: 'Retomar prova' })).toBeVisible();
  await page.getByRole('button', { name: 'Retomar prova' }).click();
  for (const n of [1, 2, 3]) {
    await expect(page.getByRole('group', { name: new RegExp(`Pergunta ${n}\\?`) }).getByLabel('Certa', { exact: true })).toBeChecked();
  }
  ev = await evidence(page);
  expect(ev.attempts).toEqual([{ attempt_no: 1, state: 'IN_PROGRESS', passed: null }]);

  // 4) completa com 6/10 corretas e envia: reprovado (minimo 70%)
  for (const n of [4, 5, 6]) await choose(page, n, 'Certa');
  for (const n of [7, 8, 9, 10]) await choose(page, n, 'Errada');
  await sendExam(page);
  await expect(page.getByText('Não aprovado', { exact: true })).toBeVisible();
  await expect(page.getByText('Parte 1: 60% — abaixo do mínimo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Concluir treinamento' })).toHaveCount(0);
  ev = await evidence(page);
  expect(ev.attempts).toEqual([{ attempt_no: 1, state: 'SUBMITTED', passed: 0 }]);
  expect(ev.matricula.status).toBe('EM_ANDAMENTO');
  expect(ev.historico).toHaveLength(0);
  expect(ev.documentos).toBe(0);
  expect(ev.r2Objects).toBe(0);

  // 5) nova tentativa: formulario limpo; responde tudo certo e aprova
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('form', { name: 'Tentativa 2' })).toBeVisible();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
  for (let n = 1; n <= 10; n++) await choose(page, n, 'Certa');
  await sendExam(page);
  await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
  await expect(page.getByText('Parte 1: 100% — atingiu o mínimo')).toBeVisible();
  ev = await evidence(page);
  expect(ev.attempts).toEqual([
    { attempt_no: 1, state: 'SUBMITTED', passed: 0 },
    { attempt_no: 2, state: 'SUBMITTED', passed: 1 },
  ]);
  // aprovar a prova e evidencia, nao conclusao: matricula ainda aberta ate /finalizar
  expect(ev.matricula.status).toBe('EM_ANDAMENTO');
  expect(ev.historico).toHaveLength(0);

  // 6) finalizar pelo endpoint canonico -> CONCLUIDO + qualificacao + certificado
  await page.getByRole('button', { name: 'Concluir treinamento' }).click();
  await expect(page).toHaveURL(/\/lms(\/|$)/);
  await expect.poll(async () => (await evidence(page)).matricula.status).toBe('CONCLUIDO');
  await expect.poll(async () => (await evidence(page)).historico[0]?.numero_certificado ?? null, { timeout: 15_000 }).toBeTruthy();
  ev = await evidence(page);
  expect(ev.matricula.progresso_pct).toBe(100);
  expect(ev.historico).toHaveLength(1);
  expect(ev.historico[0]).toMatchObject({ status: 'CONCLUIDA', lms_matricula_id: MATRICULA });
  expect(ev.historico[0].numero_certificado).toBeTruthy();
  expect(ev.historico[0].validacao_hash).toMatch(/^[0-9A-F]{16}$/);
  expect(ev.matricula.qualificacao_historico_id).toBe(ev.historico[0].id);
  expect(ev.historico[0].certificado_arquivo_id).not.toBeNull();
  expect(ev.documentos).toBe(1);
  expect(ev.r2Objects).toBe(1);
  expect(ev.renders).toBe(1);
  const afterFinalize = ev;

  // 7) reabertura: concluido, sem nova tentativa e sem perda/duplicacao de evidencias
  await page.goto(`/lms/provas/${MATRICULA}`);
  await expect(page.getByText('Treinamento já concluído.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Iniciar prova|Tentar novamente|Retomar prova/ })).toHaveCount(0);
  await page.goto(`/lms/player/${MATRICULA}`);
  await expect(page.getByTestId('lms-open-exam')).toHaveCount(0);
  await page.reload();
  expect(await evidence(page)).toEqual(afterFinalize);

  expect(pageErrors).toEqual([]);
});
