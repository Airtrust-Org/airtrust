import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';

type ScriptVars = Record<string, string>;

function isLocalBaseUrl(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  return baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
}

function runSeedScript(command: string, apiBase: string): ScriptVars {
  const output = execSync(command, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AIRTRUST_LOCAL_API_BASE: apiBase,
    },
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const vars: ScriptVars = {};
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) continue;
    vars[key] = rest.join('=').trim();
  }

  return vars;
}

async function loginAsAdmin(request: Parameters<typeof test>[0]['request'], apiBase: string) {
  const email = process.env.AIRTRUST_LOCAL_LMS_EMAIL || 'admin@airtrust.com';
  const password = process.env.AIRTRUST_LOCAL_LMS_PASSWORD || 'Admin@123';

  const response = await request.post(`${apiBase}/auth/login`, {
    data: {
      email,
      senha: password,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    success: boolean;
    data?: { accessToken?: string };
  };

  expect(body.success).toBeTruthy();
  expect(body.data?.accessToken).toBeTruthy();
  return body.data?.accessToken as string;
}

test.describe.serial('LMS completion by format (local)', () => {
  test.beforeEach(async ({}, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string | undefined;
    test.skip(
      !isLocalBaseUrl(baseURL),
      'This suite is designed for local stack only (BASE_URL localhost).',
    );
    test.skip(
      process.env.E2E_LMS_LOCAL_SMOKE !== '1',
      'Set E2E_LMS_LOCAL_SMOKE=1 to enable local LMS completion E2E.',
    );
  });

  test('finalizes PDF enrollment and returns CONCLUIDO', async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const apiBase = `${baseURL.replace(/\/$/, '')}/api`;

    const seedVars = runSeedScript('bash scripts/seed-lms-pdf-demo.sh', apiBase);
    const matriculaId = Number(seedVars.MATRICULA_ID || 0);
    expect(matriculaId).toBeGreaterThan(0);

    const token = await loginAsAdmin(request, apiBase);

    const finalize = await request.post(`${apiBase}/lms/matriculas/${matriculaId}/finalizar`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(finalize.ok()).toBeTruthy();
    const body = (await finalize.json()) as {
      success: boolean;
      data?: {
        matricula_id: number;
        novo_status: string;
        progresso_pct: number;
      };
    };

    expect(body.success).toBeTruthy();
    expect(body.data?.matricula_id).toBe(matriculaId);
    expect(body.data?.novo_status).toBe('CONCLUIDO');
    expect(body.data?.progresso_pct).toBe(100);
  });

  test('finalizes PPTX enrollment and returns CONCLUIDO', async ({ request }, testInfo) => {
    const baseURL = testInfo.project.use.baseURL as string;
    const apiBase = `${baseURL.replace(/\/$/, '')}/api`;

    const seedVars = runSeedScript('bash scripts/seed-lms-pptx-demo.sh', apiBase);
    const matriculaId = Number(seedVars.MATRICULA_ID || 0);
    expect(matriculaId).toBeGreaterThan(0);

    const token = await loginAsAdmin(request, apiBase);

    const finalize = await request.post(`${apiBase}/lms/matriculas/${matriculaId}/finalizar`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });

    expect(finalize.ok()).toBeTruthy();
    const body = (await finalize.json()) as {
      success: boolean;
      data?: {
        matricula_id: number;
        novo_status: string;
        progresso_pct: number;
      };
    };

    expect(body.success).toBeTruthy();
    expect(body.data?.matricula_id).toBe(matriculaId);
    expect(body.data?.novo_status).toBe('CONCLUIDO');
    expect(body.data?.progresso_pct).toBe(100);
  });
});
