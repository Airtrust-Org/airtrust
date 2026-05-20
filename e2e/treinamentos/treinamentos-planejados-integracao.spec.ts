import { expect, test } from '@playwright/test';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
  meta?: unknown;
  stats?: unknown;
  pagination?: unknown;
};

type SolicitacaoApiItem = {
  id: string;
  titulo: string;
  status: string;
  solicitante_id: number;
  qualificacao_id?: number | null;
  treinamento_planejado_id?: number | null;
};

type TreinamentoPlanejadoListItem = {
  id: number;
  titulo?: string | null;
  status: string;
  participantes: Array<{ funcionario_id: number; qualificacao_historico_id?: number | null }>;
};

type TreinamentoPlanejadoListResponse = {
  items: TreinamentoPlanejadoListItem[];
  total: number;
};

type TreinamentoPlanejadoDetalhe = {
  id: number;
  titulo?: string | null;
  status: string;
  participantes: Array<{ funcionario_id: number; qualificacao_historico_id?: number | null }>;
};

type HistoricoQualificacaoItem = {
  id: number;
  status: string;
  funcionario_id: number;
  qualificacao_id?: number | null;
  observacoes?: string | null;
};

function formatFutureDate(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function fetchApi<T>(page: Parameters<typeof test>[0]['page'], path: string) {
  return page.evaluate(async (inputPath) => {
    const response = await fetch(inputPath, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    const json = (await response.json()) as ApiEnvelope<T>;
    return { status: response.status, json };
  }, path) as Promise<{ status: number; json: ApiEnvelope<T> }>;
}

async function waitForValue<T>(
  read: () => Promise<T | null>,
  options: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const timeout = options.timeout ?? 20000;
  const interval = options.interval ?? 500;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeout) {
    const value = await read();
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timed out after ${timeout}ms waiting for value`);
}

async function ensureLoggedIn(page: Parameters<typeof test>[0]['page']): Promise<void> {
  const adminShortcut = page.getByRole('button', { name: /^admin$/i });
  const shouldBypassLogin = await adminShortcut.isVisible({ timeout: 2000 }).catch(() => false);
  if (!shouldBypassLogin) {
    return;
  }

  await adminShortcut.click();
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}

test.describe.serial('Treinamentos planejados integrados com solicitações', () => {
  test('cria, agenda e conclui uma solicitação refletindo no central de planejados e no histórico', async ({
    page,
  }) => {
    test.slow();

    const uniqueTitle = `E2E Integracao TP ${Date.now()}`;
    const uniqueDayOffset = 10 + Number(String(Date.now()).slice(-2));
    const dataPrevista = formatFutureDate(uniqueDayOffset);

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await ensureLoggedIn(page);
    if (!page.url().includes('/treinamentos/solicitacoes')) {
      await page.goto('/treinamentos/solicitacoes');
    }
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible();

    await page.getByTestId('solicitacoes-nova').click();
    await expect(page.getByTestId('solicitacao-criar-modal')).toBeVisible();

    let solicitanteId: number;
    const solicitanteSelect = page.getByTestId('solicitacao-solicitante');
    if ((await solicitanteSelect.count()) > 0) {
      const solicitanteValue = await solicitanteSelect
        .locator('option')
        .nth(1)
        .getAttribute('value');
      expect(solicitanteValue).toBeTruthy();
      solicitanteId = Number(solicitanteValue);
      await solicitanteSelect.selectOption(String(solicitanteId));
    } else {
      const me = await fetchApi<{ user?: { funcionario_id?: number | string | null } }>(
        page,
        '/api/auth/me',
      );
      solicitanteId = Number(me.json.data?.user?.funcionario_id || 0);
      expect(solicitanteId).toBeGreaterThan(0);
    }

    const qualificacaoSelect = page.getByTestId('solicitacao-qualificacao');
    const qualificacaoValue = await qualificacaoSelect
      .locator('option')
      .nth(1)
      .getAttribute('value');
    const qualificacaoLabel =
      (await qualificacaoSelect.locator('option').nth(1).textContent())?.trim() || '';
    expect(qualificacaoValue).toBeTruthy();
    await qualificacaoSelect.selectOption(String(qualificacaoValue));

    await page.getByTestId('solicitacao-titulo').fill(uniqueTitle);
    await page.getByTestId('solicitacao-data-prevista').fill(dataPrevista);
    await page.getByRole('button', { name: /criar solicitação/i }).click();
    await expect(page.getByTestId('solicitacao-criar-modal')).toBeHidden({ timeout: 15000 });

    const solicitacaoId = await waitForValue(
      async () => {
        const response = await fetchApi<SolicitacaoApiItem[]>(
          page,
          '/api/treinamentos/solicitacoes',
        );
        if (!response.json.success) return null;
        return response.json.data?.find((item) => item.titulo === uniqueTitle)?.id || null;
      },
      { timeout: 20000 },
    );

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });

    const row = page.getByTestId(`solicitacao-item-${solicitacaoId}`);
    await expect(row).toContainText(uniqueTitle);

    await row.click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-aprovar-gestor').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 15000 },
      )
      .toBe('APROVADA_GESTOR');

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`solicitacao-item-${solicitacaoId}`)).toContainText(
      /aprovada gestor/i,
    );
    await page.getByTestId(`solicitacao-item-${solicitacaoId}`).click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-aprovar-ops').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 15000 },
      )
      .toBe('APROVADA_OPS');

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId(`solicitacao-item-${solicitacaoId}`)).toContainText(
      /aprovada ops/i,
    );
    await page.getByTestId(`solicitacao-item-${solicitacaoId}`).click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-agendar-data').fill(dataPrevista);
    await page.getByTestId('solicitacao-agendar-confirmar').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 20000 },
      )
      .toBe('AGENDADA');

    const treinamentoId = await waitForValue(
      async () => {
        const response = await fetchApi<SolicitacaoApiItem>(
          page,
          `/api/treinamentos/solicitacoes/${solicitacaoId}`,
        );
        if (!response.json.success) return null;
        return response.json.data?.treinamento_planejado_id || null;
      },
      { timeout: 20000 },
    );

    const treinamentoDetalheAgendado = await waitForValue(
      async () => {
        const response = await fetchApi<TreinamentoPlanejadoDetalhe>(
          page,
          `/api/treinamentos/planejados/${treinamentoId}`,
        );
        return response.json.data || null;
      },
      { timeout: 15000 },
    );
    expect(treinamentoDetalheAgendado.titulo).toBe(uniqueTitle);

    const participanteAgendado = treinamentoDetalheAgendado.participantes.find(
      (item) => item.funcionario_id === solicitanteId,
    );
    expect(participanteAgendado?.qualificacao_historico_id).toBeTruthy();

    await expect
      .poll(
        async () => {
          const response = await fetchApi<HistoricoQualificacaoItem[]>(
            page,
            `/api/qualificacoes/historico?limit=5&stats=false&id=${participanteAgendado?.qualificacao_historico_id}`,
          );
          if (!response.json.success) return null;
          return (
            response.json.data?.find(
              (item) => item.id === participanteAgendado?.qualificacao_historico_id,
            )?.status || null
          );
        },
        { timeout: 15000 },
      )
      .toBe('PLANEJADA');

    await page.goto('/treinamentos/solicitacoes');
    await expect(page.getByRole('heading', { name: /solicitações de treinamento/i })).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId(`solicitacao-item-${solicitacaoId}`).click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeVisible();
    await page.getByTestId('solicitacao-concluir').click();
    await expect(page.getByTestId('solicitacao-detalhe-modal')).toBeHidden({ timeout: 15000 });

    await expect
      .poll(
        async () => {
          const response = await fetchApi<SolicitacaoApiItem>(
            page,
            `/api/treinamentos/solicitacoes/${solicitacaoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 20000 },
      )
      .toBe('CONCLUIDA');

    await expect
      .poll(
        async () => {
          const response = await fetchApi<TreinamentoPlanejadoDetalhe>(
            page,
            `/api/treinamentos/planejados/${treinamentoId}`,
          );
          return response.json.data?.status || null;
        },
        { timeout: 20000 },
      )
      .toBe('CONCLUIDO');

    await expect
      .poll(
        async () => {
          const response = await fetchApi<HistoricoQualificacaoItem[]>(
            page,
            `/api/qualificacoes/historico?limit=5&stats=false&id=${participanteAgendado?.qualificacao_historico_id}`,
          );
          if (!response.json.success) return null;
          return (
            response.json.data?.find(
              (item) => item.id === participanteAgendado?.qualificacao_historico_id,
            )?.status || null
          );
        },
        { timeout: 20000 },
      )
      .toBe('VALIDA');
  });
});
