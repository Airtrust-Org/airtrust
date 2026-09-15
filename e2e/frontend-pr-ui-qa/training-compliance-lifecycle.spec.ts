import { expect, test, type Page, type Response } from '@playwright/test';
import { assertLiveFrontendShaFromPage } from '../lib/live-sha-guard.mjs';

const SHORT_SHA = String(process.env.RELEASE_SHA || '').trim().toLowerCase().slice(0, 7);
const CODE = String(process.env.QA_LIFECYCLE_CODE || '').trim();
const API_BASE = String(
  process.env.STAGING_API_BASE_URL || 'https://airtrust-api-staging.airtrust.workers.dev',
).replace(/\/$/, '');

const sectorName = `${CODE} Setor`;
const functionName = `${CODE} Cargo`;
const invalidFunctionName = `${CODE} Cargo não vinculado`;
const requiredTypeCode = `${CODE}-REQ`;
const orphanTypeCode = `${CODE}-ORPH`;
const requiredCourseTitle = `${CODE} EAD obrigatório`;
const orphanCourseTitle = `${CODE} EAD legado`;
const employee1Name = `${CODE} Pessoa 1`;
const employee2Name = `${CODE} Pessoa 2`;

// This lifecycle mutates an isolated staging fixture. A failed attempt must never
// retry against the partially-mutated state; cleanup is handled by the workflow.
test.describe.configure({ retries: 0 });

type ApiResult<T = any> = { status: number; ok: boolean; json: T };

function waitResponse(page: Page, path: string, method?: string): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return (
          url.pathname === path &&
          (!method || response.request().method().toUpperCase() === method.toUpperCase())
        );
      } catch {
        return false;
      }
    },
    { timeout: 45_000 },
  );
}

async function api<T = any>(
  page: Page,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ apiBase, requestPath, method, body }) => {
      const token =
        window.sessionStorage.getItem('airtrust_token') ||
        window.localStorage.getItem('airtrust_token');
      if (!token) throw new Error('QA_AUTH_TOKEN_MISSING');
      const response = await fetch(`${apiBase}${requestPath}`, {
        method: method || 'GET',
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      return { status: response.status, ok: response.ok, json };
    },
    { apiBase: API_BASE, requestPath: path, method: options.method, body: options.body },
  );
}

async function employeeSnapshot(page: Page, employeeId: number) {
  const result = await api(page, `/api/compliance-treinamentos/funcionarios/${employeeId}`);
  expect(result.ok, JSON.stringify(result.json)).toBe(true);
  return result.json.data;
}

async function completeViaXapi(page: Page, matriculaId: number, suffix: string) {
  // Mirror a real player launch: mint a short-lived, enrollment-scoped asset
  // capability before the terminal xAPI request. The completion integrity gate
  // deliberately rejects xAPI completion without this session.
  const session = await api(page, '/api/lms/assets/session', {
    method: 'POST',
    body: { matricula_id: matriculaId },
  });
  expect(session.ok, JSON.stringify(session.json)).toBe(true);
  expect(session.json.data).toMatchObject({ active: true, matriculaId });

  return api(page, '/api/lms/xapi/statements', {
    method: 'POST',
    body: {
      matricula_id: matriculaId,
      actor: { name: `QA lifecycle ${CODE}` },
      verb: {
        id: 'http://adlnet.gov/expapi/verbs/completed',
        display: { 'pt-BR': 'concluiu' },
      },
      object: { id: `urn:airtrust:qa:${CODE}:${suffix}`, objectType: 'Activity' },
      result: {
        success: true,
        completion: true,
        score: { raw: 85, max: 100, min: 0, scaled: 0.85 },
      },
    },
  });
}

async function filteredSummary(page: Page, sectorId: number, functionId: number) {
  const result = await api(
    page,
    `/api/compliance-treinamentos/resumo?setor_id=${sectorId}&funcao_id=${functionId}`,
  );
  expect(result.ok, JSON.stringify(result.json)).toBe(true);
  return result.json.data;
}

async function reconciliation(page: Page, sectorId: number, functionId: number) {
  const result = await api(
    page,
    `/api/compliance-treinamentos/reconciliacao?setor_id=${sectorId}&funcao_id=${functionId}`,
  );
  expect(result.ok, JSON.stringify(result.json)).toBe(true);
  return result.json.data;
}

function requirement(person: any, code: string) {
  return (person.requisitos || []).find((item: any) => item.qualificacao_tipo_codigo === code);
}

async function chooseOrgScope(page: Page, sectorId: number, functionId?: number) {
  const matrixSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Matriz por organização', exact: true }),
  });
  const sector = matrixSection.locator('select').nth(0);
  await sector.selectOption(String(sectorId));
  const fn = matrixSection.locator('select').nth(1);
  if (functionId) await fn.selectOption(String(functionId));
  else await fn.selectOption('');
}

async function changeMatrixRule(page: Page, code: string, value: string, method: string) {
  const row = page.locator('tbody tr').filter({ hasText: code }).first();
  await expect(row).toBeVisible();
  const responseP = page.waitForResponse(
    (response) => {
      try {
        const url = new URL(response.url());
        return (
          url.pathname.startsWith('/api/compliance-treinamentos/regras') &&
          response.request().method() === method
        );
      } catch {
        return false;
      }
    },
    { timeout: 45_000 },
  );
  await row.locator('select').selectOption(value);
  const response = await responseP;
  expect(response.ok(), `${method} ${response.url()} HTTP ${response.status()}`).toBe(true);
  return row;
}

test('full training compliance lifecycle recalculates organization, enrollments and evidence', async ({
  page,
}) => {
  expect(CODE).toMatch(/^QA-COMP-LIFE-/);

  // This profile is intentionally write-capable, but only against staging.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const host = url.hostname.toLowerCase();
    if (
      host === 'airtrust.online' ||
      host === 'api.airtrust.online' ||
      host === 'airtrust.pages.dev' ||
      host === 'airtrust-api.airtrust.workers.dev' ||
      host === 'airtrust-api-production.airtrust.workers.dev'
    ) {
      await route.abort('blockedbyclient');
      throw new Error(`PRODUCTION_TARGET_REJECTED:${host}`);
    }
    await route.continue();
  });

  await page.goto('/treinamentos/compliance', { waitUntil: 'domcontentloaded' });
  if (SHORT_SHA) await assertLiveFrontendShaFromPage(page, SHORT_SHA, 'training-compliance-lifecycle');
  await expect(page.getByRole('heading', { name: 'Compliance de Treinamentos' })).toBeVisible();

  const catalogs = await api(page, '/api/compliance-treinamentos/catalogos');
  expect(catalogs.ok, JSON.stringify(catalogs.json)).toBe(true);
  const sector = catalogs.json.data.setores.find((item: any) => item.nome === sectorName);
  const fn = catalogs.json.data.funcoes.find((item: any) => item.nome === functionName);
  const invalidFn = catalogs.json.data.funcoes.find((item: any) => item.nome === invalidFunctionName);
  expect(sector).toBeTruthy();
  expect(fn).toBeTruthy();
  expect(invalidFn).toBeTruthy();
  expect(
    catalogs.json.data.setor_funcoes.some(
      (pair: any) => pair.setor_id === sector.id && pair.funcao_id === fn.id,
    ),
  ).toBe(true);
  expect(
    catalogs.json.data.setor_funcoes.some(
      (pair: any) => pair.setor_id === sector.id && pair.funcao_id === invalidFn.id,
    ),
  ).toBe(false);

  const people = await api(
    page,
    `/api/compliance-treinamentos/pessoas?setor_id=${sector.id}&funcao_id=${fn.id}`,
  );
  expect(people.ok).toBe(true);
  expect(people.json.data.map((p: any) => p.nome).sort()).toEqual(
    [employee1Name, employee2Name].sort(),
  );
  const employeeIds = people.json.data.map((p: any) => Number(p.id));

  await page.getByRole('button', { name: 'Configuração da matriz', exact: true }).click();
  await expect(page.getByText('Matriz por organização', { exact: true })).toBeVisible();
  await chooseOrgScope(page, sector.id);

  let matrix = await api(
    page,
    `/api/compliance-treinamentos/matriz-organizacao?setor_id=${sector.id}`,
  );
  expect(matrix.ok).toBe(true);
  let requiredRow = matrix.json.data.find((row: any) => row.qualificacao_tipo_codigo === requiredTypeCode);
  expect(requiredRow.impacto).toMatchObject({
    pessoas: 2,
    atingidas_neste_nivel: 2,
    com_requisito: 0,
    sem_requisito: 2,
    matriculados: 0,
    sem_matricula: 2,
  });

  // 1) Setor-level requirement: both people immediately become never-realized gaps.
  await changeMatrixRule(page, requiredTypeCode, 'OBRIGATORIA', 'POST');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).requisitos_obrigatorios).toBe(2);
  let s = await filteredSummary(page, sector.id, fn.id);
  expect(s).toMatchObject({
    pessoas: 2,
    requisitos_obrigatorios: 2,
    conformes: 0,
    nao_realizados: 2,
    em_andamento: 0,
    compliance_pct: 0,
  });

  // 2) More-specific Setor+Cargo N/A overrides the inherited sector requirement.
  await chooseOrgScope(page, sector.id, fn.id);
  matrix = await api(
    page,
    `/api/compliance-treinamentos/matriz-organizacao?setor_id=${sector.id}&funcao_id=${fn.id}`,
  );
  requiredRow = matrix.json.data.find((row: any) => row.qualificacao_tipo_codigo === requiredTypeCode);
  expect(requiredRow.efetiva).toMatchObject({ escopo: 'SETOR', obrigatoriedade: 'OBRIGATORIA' });
  expect(requiredRow.direta).toBeNull();
  await changeMatrixRule(page, requiredTypeCode, 'NAO_APLICA', 'POST');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).requisitos_obrigatorios).toBe(0);
  for (const id of employeeIds) expect(requirement(await employeeSnapshot(page, id), requiredTypeCode)).toBeUndefined();

  // Removing the override must immediately inherit the sector requirement again.
  await changeMatrixRule(page, requiredTypeCode, 'HERDAR', 'DELETE');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).nao_realizados).toBe(2);

  // Fail closed: same-tenant function that is not mapped to the sector cannot be used.
  const invalidPair = await api(page, '/api/compliance-treinamentos/regras', {
    method: 'POST',
    body: {
      qualificacao_tipo_id: requiredRow.qualificacao_tipo_id,
      escopo: 'SETOR_FUNCAO',
      setor_id: sector.id,
      funcao_id: invalidFn.id,
      obrigatoriedade: 'OBRIGATORIA',
      origem: 'EMPRESA',
      referencia_normativa: 'QA lifecycle invalid pair',
    },
  });
  expect(invalidPair.status).toBe(400);

  // 3) Reconciliation finds both mandatory gaps and bulk-enrolls them only on explicit click.
  await page.getByRole('button', { name: 'Matrículas × Matriz', exact: true }).click();
  let recon = await reconciliation(page, sector.id, fn.id);
  let gap = recon.gaps_matricula.find((item: any) => item.qualificacao_tipo_codigo === requiredTypeCode);
  expect(gap).toBeTruthy();
  expect(gap.pessoas).toBe(2);
  expect(gap.nunca_realizados).toBe(2);
  expect(gap.cursos_ead).toHaveLength(1);
  const requiredCourseId = Number(gap.cursos_ead[0].id);

  const gapRow = page.locator('tbody tr').filter({ hasText: requiredTypeCode }).first();
  await expect(gapRow).toBeVisible();
  const enrollResponseP = waitResponse(page, '/api/lms/matriculas/lote', 'POST');
  await gapRow.getByRole('button', { name: 'Matricular gaps (sem e-mail)' }).click();
  const enrollResponse = await enrollResponseP;
  expect(enrollResponse.ok()).toBe(true);
  const enrollPayload = await enrollResponse.json();
  expect(enrollPayload.data).toMatchObject({ criadas: 2, ignoradas: 0, erros: 0 });
  expect(enrollResponse.request().postDataJSON()).toMatchObject({
    funcionario_ids: expect.arrayContaining(employeeIds),
    curso_id: requiredCourseId,
    enviar_convite_email: false,
  });
  await expect.poll(async () => {
    const current = await reconciliation(page, sector.id, fn.id);
    return current.gaps_matricula.some((item: any) => item.qualificacao_tipo_codigo === requiredTypeCode);
  }).toBe(false);

  // Invitation is a separate explicit step. Synthetic employees have no e-mail, so no external mail is emitted.
  const requiredInviteText = page.getByText(requiredCourseTitle, { exact: true }).last();
  const requiredInviteGroup = requiredInviteText.locator(
    'xpath=ancestor::div[button[contains(normalize-space(.), "Enviar/re-enviar convite por e-mail")]][1]',
  );
  await expect(requiredInviteGroup).toBeVisible();
  const inviteResponseP = waitResponse(page, '/api/lms/matriculas/convites/lote', 'POST');
  await requiredInviteGroup.getByRole('button', { name: 'Enviar/re-enviar convite por e-mail' }).click();
  const inviteResponse = await inviteResponseP;
  expect(inviteResponse.ok()).toBe(true);
  expect(await inviteResponse.json()).toMatchObject({
    data: { enviados: 0, sem_email: 2, falhas: 0, nao_encontradas: 0 },
  });

  // Idempotency: same explicit enrollment request preserves existing records and remains silent when requested.
  const idempotent = await api(page, '/api/lms/matriculas/lote', {
    method: 'POST',
    body: { funcionario_ids: employeeIds, curso_id: requiredCourseId, observacoes: 'QA lifecycle idempotency', enviar_convite_email: false },
  });
  expect(idempotent.ok).toBe(true);
  expect(idempotent.json.data).toMatchObject({ criadas: 0, ignoradas: 2, erros: 0 });

  const courseEnrollments = await api(page, `/api/lms/matriculas/curso/${requiredCourseId}?limit=20`);
  expect(courseEnrollments.ok).toBe(true);
  const syntheticEnrollments = courseEnrollments.json.data.filter((row: any) =>
    employeeIds.includes(Number(row.funcionario_id)),
  );
  expect(syntheticEnrollments).toHaveLength(2);
  const enrollmentByEmployee = new Map(
    syntheticEnrollments.map((row: any) => [Number(row.funcionario_id), Number(row.id)]),
  );

  for (const id of employeeIds) {
    const req = requirement(await employeeSnapshot(page, id), requiredTypeCode);
    expect(req.status_compliance).toBe('NAO_REALIZADO');
    expect(req.lms_status).toBe('NAO_INICIADO');
  }

  // 4) Progress transitions recalculate people, sector and training aggregates.
  const e1EnrollmentId = enrollmentByEmployee.get(employeeIds[0]);
  const e2EnrollmentId = enrollmentByEmployee.get(employeeIds[1]);
  expect(e1EnrollmentId).toBeTruthy();
  expect(e2EnrollmentId).toBeTruthy();
  // Persist real progress before the terminal xAPI event; completion is fail-closed
  // unless progress evidence existed before the completion request.
  const progress = await api(page, `/api/lms/matriculas/${e1EnrollmentId}/progresso`, {
    method: 'PATCH',
    body: { progresso_pct: 50 },
  });
  expect(progress.ok, JSON.stringify(progress.json)).toBe(true);
  await expect.poll(async () => requirement(await employeeSnapshot(page, employeeIds[0]), requiredTypeCode)?.status_compliance).toBe('EM_ANDAMENTO');
  s = await filteredSummary(page, sector.id, fn.id);
  expect(s).toMatchObject({ requisitos_obrigatorios: 2, conformes: 0, nao_realizados: 1, em_andamento: 1, compliance_pct: 0 });

  const complete1 = await completeViaXapi(page, Number(e1EnrollmentId), 'completion-1');
  expect(complete1.ok, JSON.stringify(complete1.json)).toBe(true);
  await expect.poll(async () => requirement(await employeeSnapshot(page, employeeIds[0]), requiredTypeCode)?.status_compliance).toBe('CONFORME');
  s = await filteredSummary(page, sector.id, fn.id);
  expect(s).toMatchObject({ requisitos_obrigatorios: 2, conformes: 1, nao_realizados: 1, em_andamento: 0, compliance_pct: 50 });

  const progress2 = await api(page, `/api/lms/matriculas/${e2EnrollmentId}/progresso`, {
    method: 'PATCH',
    body: { progresso_pct: 50 },
  });
  expect(progress2.ok, JSON.stringify(progress2.json)).toBe(true);
  const complete2 = await completeViaXapi(page, Number(e2EnrollmentId), 'completion-2');
  expect(complete2.ok, JSON.stringify(complete2.json)).toBe(true);
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).compliance_pct).toBe(100);

  const trainings = await api(
    page,
    `/api/compliance-treinamentos/treinamentos?setor_id=${sector.id}&funcao_id=${fn.id}`,
  );
  const training = trainings.json.data.find((row: any) => row.qualificacao_tipo_codigo === requiredTypeCode);
  expect(training).toMatchObject({ pessoas: 2, conformes: 2, nao_realizados: 0, em_andamento: 0, compliance_pct: 100 });

  const sectors = await api(page, `/api/compliance-treinamentos/setores?setor_id=${sector.id}`);
  const sectorAggregate = sectors.json.data.find((row: any) => row.setor_id === sector.id);
  expect(sectorAggregate).toBeTruthy();
  const cargoAggregate = sectorAggregate.cargos.find((row: any) => row.funcao_id === fn.id);
  expect(cargoAggregate).toMatchObject({ pessoas: 2, requisitos_obrigatorios: 2, conformes: 2, compliance_pct: 100 });

  // 5) Recommended keeps applicability but leaves the mandatory denominator; restore afterwards.
  await page.getByRole('button', { name: 'Configuração da matriz', exact: true }).click();
  await chooseOrgScope(page, sector.id);
  await changeMatrixRule(page, requiredTypeCode, 'RECOMENDADA', 'PUT');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).requisitos_obrigatorios).toBe(0);
  for (const id of employeeIds) {
    const req = requirement(await employeeSnapshot(page, id), requiredTypeCode);
    expect(req.obrigatoriedade).toBe('RECOMENDADA');
    expect(req.status_compliance).toBe('CONFORME');
  }
  await changeMatrixRule(page, requiredTypeCode, 'OBRIGATORIA', 'PUT');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).compliance_pct).toBe(100);

  // 6) N/A after completion removes the denominator without deleting evidence, then inheritance restores 100%.
  await chooseOrgScope(page, sector.id, fn.id);
  await changeMatrixRule(page, requiredTypeCode, 'NAO_APLICA', 'POST');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).requisitos_obrigatorios).toBe(0);
  recon = await reconciliation(page, sector.id, fn.id);
  expect(
    recon.matriculas_revisao.filter(
      (row: any) => row.qualificacao_tipo_codigo === requiredTypeCode && row.situacao === 'NAO_APLICA_MATRICULADO',
    ),
  ).toHaveLength(2);
  await changeMatrixRule(page, requiredTypeCode, 'HERDAR', 'DELETE');
  await expect.poll(async () => (await filteredSummary(page, sector.id, fn.id)).compliance_pct).toBe(100);

  // 7) Historical orphan enrollment: mark avulsa, reopen, then convert to Setor+Cargo obligation.
  await page.getByRole('button', { name: 'Matrículas × Matriz', exact: true }).click();
  recon = await reconciliation(page, sector.id, fn.id);
  let orphanReview = recon.matriculas_revisao.find(
    (row: any) => row.qualificacao_tipo_codigo === orphanTypeCode,
  );
  expect(orphanReview).toMatchObject({ situacao: 'MATRICULADO_SEM_REQUISITO' });
  const orphanRow = page.locator('tbody tr').filter({ hasText: orphanCourseTitle }).first();
  await expect(orphanRow).toBeVisible();
  await orphanRow.locator('select').selectOption('MANTER_AVULSA');
  let decisionP = waitResponse(
    page,
    `/api/compliance-treinamentos/reconciliacao/${orphanReview.matricula_id}/decisao`,
    'POST',
  );
  await orphanRow.getByRole('button', { name: 'Aplicar' }).click();
  expect((await decisionP).ok()).toBe(true);
  await expect.poll(async () => {
    const current = await reconciliation(page, sector.id, fn.id);
    return current.matriculas_revisao.find((row: any) => row.matricula_id === orphanReview.matricula_id)?.situacao;
  }).toBe('MATRICULA_AVULSA_RECONCILIADA');

  const avulsaRow = page.locator('tbody tr').filter({ hasText: orphanCourseTitle }).first();
  await avulsaRow.locator('select').selectOption('REABRIR');
  decisionP = waitResponse(
    page,
    `/api/compliance-treinamentos/reconciliacao/${orphanReview.matricula_id}/decisao`,
    'DELETE',
  );
  await avulsaRow.getByRole('button', { name: 'Aplicar' }).click();
  expect((await decisionP).ok()).toBe(true);
  await expect.poll(async () => {
    const current = await reconciliation(page, sector.id, fn.id);
    return current.matriculas_revisao.find((row: any) => row.matricula_id === orphanReview.matricula_id)?.situacao;
  }).toBe('MATRICULADO_SEM_REQUISITO');

  const reopenedRow = page.locator('tbody tr').filter({ hasText: orphanCourseTitle }).first();
  await reopenedRow.locator('select').selectOption('VINCULAR_SETOR_FUNCAO');
  const linkRuleP = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/compliance-treinamentos/regras' &&
      response.request().method() === 'POST',
    { timeout: 45_000 },
  );
  await reopenedRow.getByRole('button', { name: 'Aplicar' }).click();
  expect((await linkRuleP).ok()).toBe(true);

  await expect.poll(async () => {
    const current = await reconciliation(page, sector.id, fn.id);
    return current.matriculas_revisao.some((row: any) => row.qualificacao_tipo_codigo === orphanTypeCode);
  }).toBe(false);
  recon = await reconciliation(page, sector.id, fn.id);
  gap = recon.gaps_matricula.find((item: any) => item.qualificacao_tipo_codigo === orphanTypeCode);
  expect(gap).toBeTruthy();
  expect(gap.pessoas).toBe(1);
  expect(gap.funcionarios[0].nome).toBe(employee2Name);
  expect(gap.cursos_ead).toHaveLength(1);

  // Enroll the newly exposed peer gap. Historical enrollment is preserved and not duplicated.
  const orphanGapRow = page.locator('tbody tr').filter({ hasText: orphanTypeCode }).first();
  const enrollPeerP = waitResponse(page, '/api/lms/matriculas/lote', 'POST');
  await orphanGapRow.getByRole('button', { name: 'Matricular gaps (sem e-mail)' }).click();
  const enrollPeer = await enrollPeerP;
  expect(enrollPeer.ok()).toBe(true);
  expect((await enrollPeer.json()).data).toMatchObject({ criadas: 1, ignoradas: 0, erros: 0 });
  await expect.poll(async () => {
    const current = await reconciliation(page, sector.id, fn.id);
    return current.gaps_matricula.some((item: any) => item.qualificacao_tipo_codigo === orphanTypeCode);
  }).toBe(false);

  const finalRecon = await reconciliation(page, sector.id, fn.id);
  expect(finalRecon.resumo.gaps_matricula_acionaveis).toBe(0);
  expect(finalRecon.resumo.matriculados_sem_requisito).toBe(0);
  expect(finalRecon.resumo.nao_aplica_matriculados).toBe(0);

  // Both requirement families remain tenant-scoped and visible only in this synthetic organization.
  for (const id of employeeIds) {
    const person = await employeeSnapshot(page, id);
    expect(requirement(person, requiredTypeCode)?.status_compliance).toBe('CONFORME');
    expect(requirement(person, orphanTypeCode)?.status_compliance).toBe('NAO_REALIZADO');
  }
});
