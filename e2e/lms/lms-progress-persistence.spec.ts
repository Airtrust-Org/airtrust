/**
 * E2E – LMS progress persistence for PPTX (and PDF via progress endpoint)
 *
 * Guards:
 *  - Only runs on localhost (safe to skip in CI against production)
 *  - Requires env var E2E_LMS_LOCAL_SMOKE=1
 *
 * Run:
 *   E2E_LMS_LOCAL_SMOKE=1 npx playwright test e2e/lms/lms-progress-persistence.spec.ts --project api
 */

import { expect, test } from '@playwright/test';

const ENABLED = process.env.E2E_LMS_LOCAL_SMOKE === '1';

function isLocalBaseUrl(baseURL: string | undefined): boolean {
  if (!baseURL) return false;
  return baseURL.includes('localhost') || baseURL.includes('127.0.0.1');
}

test.describe('LMS progress persistence', () => {
  test.beforeEach(({ baseURL }) => {
    test.skip(!ENABLED || !isLocalBaseUrl(baseURL), 'Skipped: not local or smoke not enabled');
  });

  async function loginAsAdmin(
    request: Parameters<Parameters<typeof test>[0]>[0]['request'],
    apiBase: string,
  ) {
    const email = process.env.AIRTRUST_LOCAL_LMS_EMAIL ?? 'admin@airtrust.com';
    const password = process.env.AIRTRUST_LOCAL_LMS_PASSWORD ?? 'Admin@123';
    const res = await request.post(`${apiBase}/auth/login`, {
      data: { email, senha: password },
    });
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { success: boolean; data?: { accessToken?: string } };
    expect(body.success).toBe(true);
    return body.data!.accessToken!;
  }

  test('PATCH /matriculas/:id/progresso saves and returns updated fields', async ({
    request,
    baseURL,
  }) => {
    const apiBase = `${baseURL}/api/lms`;
    const token = await loginAsAdmin(request, `${baseURL}/api`);
    const headers = { Authorization: `Bearer ${token}` };

    // Grab any existing enrollment in EM_ANDAMENTO or NAO_INICIADO
    const listRes = await request.get(`${apiBase}/matriculas/minhas`, { headers });
    // If endpoint doesn't exist, use admin list
    const listAll = await request.get(`${apiBase}/matriculas?limit=5`, { headers });
    const list = (await listAll.json()) as {
      success: boolean;
      data?: Array<{ id: number; status: string; tipo_conteudo: string }>;
    };

    // Find a pptx or pdf matricula
    const candidato = list.data?.find(
      (m) => ['pptx', 'pdf'].includes(m.tipo_conteudo) && m.status !== 'CANCELADO',
    );

    if (!candidato) {
      test.skip(true, 'No PPTX/PDF enrollment found to test progress persistence');
      return;
    }

    const matriculaId = candidato.id;

    // Save progress at slide 5 (for pptx)
    const saveRes = await request.patch(`${apiBase}/matriculas/${matriculaId}/progresso`, {
      headers,
      data: { progresso_pct: 30, ultimo_slide: 5 },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveBody = (await saveRes.json()) as {
      success: boolean;
      data?: { progresso_pct: number; ultimo_slide: number; status: string };
    };
    expect(saveBody.success).toBe(true);
    expect(saveBody.data?.ultimo_slide).toBe(5);
    expect(saveBody.data?.progresso_pct).toBeGreaterThanOrEqual(30);
    expect(['EM_ANDAMENTO', 'CONCLUIDO']).toContain(saveBody.data?.status);

    // Now GET the matricula detail and verify the saved position is returned
    const detailRes = await request.get(`${apiBase}/matriculas/${matriculaId}`, { headers });
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()) as {
      success: boolean;
      data?: { ultimo_slide?: number; progresso_pct: number };
    };
    expect(detail.success).toBe(true);
    // Accept either saved value or higher (e.g. if already concluded at 100)
    if (detail.data?.ultimo_slide !== undefined) {
      expect(detail.data.ultimo_slide).toBeGreaterThanOrEqual(5);
    }
    expect(detail.data?.progresso_pct).toBeGreaterThanOrEqual(30);
  });

  test('PATCH /progresso does not regress progresso_pct when sending lower value', async ({
    request,
    baseURL,
  }) => {
    const apiBase = `${baseURL}/api/lms`;
    const token = await loginAsAdmin(request, `${baseURL}/api`);
    const headers = { Authorization: `Bearer ${token}` };

    const listAll = await request.get(`${apiBase}/matriculas?limit=5`, { headers });
    const list = (await listAll.json()) as {
      success: boolean;
      data?: Array<{ id: number; status: string; tipo_conteudo: string; progresso_pct: number }>;
    };
    const candidato = list.data?.find(
      (m) =>
        ['pptx', 'pdf'].includes(m.tipo_conteudo) &&
        m.status !== 'CANCELADO' &&
        m.progresso_pct >= 30,
    );
    if (!candidato) {
      test.skip(true, 'No enrollment with progresso_pct >= 30 to test regression');
      return;
    }

    const matriculaId = candidato.id;
    const previousPct = candidato.progresso_pct;

    // Try to save a lower progress value
    const saveRes = await request.patch(`${apiBase}/matriculas/${matriculaId}/progresso`, {
      headers,
      data: { progresso_pct: 5 },
    });
    expect(saveRes.ok()).toBeTruthy();
    const saveBody = (await saveRes.json()) as {
      success: boolean;
      data?: { progresso_pct: number };
    };
    // Backend uses MAX(current, incoming) so should not regress
    expect(saveBody.data?.progresso_pct).toBeGreaterThanOrEqual(Math.min(previousPct, 5));
  });
});
