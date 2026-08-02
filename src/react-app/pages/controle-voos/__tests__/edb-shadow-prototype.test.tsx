import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EdbShadowPrototype from '../EdbShadowPrototype';
import { fetchWithAuth } from '@/react-app/config/api';

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/ControleVoosPageShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('../components/ControleVoosPageHeader', () => ({
  default: ({
    title,
    description,
    children,
  }: {
    title: string;
    description?: string;
    children?: React.ReactNode;
  }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </header>
  ),
}));

vi.mock('../components/ControleVoosBreadcrumb', () => ({
  default: () => <nav aria-label="breadcrumb">Controle de Voos</nav>,
}));

const source = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/EdbShadowPrototype.tsx'),
  'utf8',
);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function leg(sequence: number, origin: string, destination: string) {
  return {
    sequence,
    operationalDate: '2026-08-02',
    origin,
    destination,
    timezone: 'America/Sao_Paulo',
    engineStartTime: '08:00',
    takeoffTime: '08:10',
    landingTime: '09:00',
    engineShutdownTime: '09:10',
    times: {
      blockMinutes: 70,
      takeoffToLandingMinutes: 50,
      dayMinutes: 50,
      nightMinutes: 0,
      vfrMinutes: 50,
      ifrActualMinutes: 0,
      ifrSimulatedMinutes: 0,
    },
    dayLandings: 1,
    nightLandings: 0,
    cycles: 1,
    fuelAtEngineStart: {
      value: 900,
      unit: 'KG',
      source: { kind: 'SIGVOOS', reference: `cv_voo_etapas:${sequence}` },
    },
    fuelAtEngineShutdown: {
      value: 600,
      unit: 'KG',
      source: { kind: 'SIGVOOS', reference: `cv_voo_etapas:${sequence}` },
    },
    fuelConsumed: {
      value: 300,
      unit: 'KG',
      source: { kind: 'AIRTRUST_CONTROL_FLIGHTS', reference: `cv_voo_etapas:${sequence}` },
    },
    fuelAdded: {
      value: null,
      unit: 'KG',
      source: { kind: 'UNKNOWN' },
    },
    personsOnBoard: 8,
    payload: 320,
    payloadUnit: 'KG',
    flightNatureCode: 'TPX',
    crew: [
      {
        personReference: `funcionarios:${sequence}`,
        displayName: `Tripulante ${sequence}`,
        canac: `100${sequence}`,
        function: sequence === 1 ? 'P1' : 'P2',
        reportTime: '07:20',
        contractualBase: 'SBJR',
        source: { kind: 'AIRTRUST_CONTROL_FLIGHTS', reference: `cv_voo_tripulantes:${sequence}` },
      },
    ],
    occurrenceSummary: sequence === 1 ? 'Sem ocorrências.' : null,
    technicalDiscrepancySummary: null,
    source: { kind: 'SIGVOOS', reference: `cv_voo_etapas:${sequence}` },
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      status: 'shadow_draft',
      classification: 'NON_OFFICIAL_SHADOW_PREVIEW',
      notices: {
        officialLogbook: false,
        replacesPaper: false,
        containsSignature: false,
        persistsRegulatedRecord: false,
      },
      draft: {
        schemaVersion: 'edb.draft.v1',
        draftId: '00000000-0000-4000-8000-000000000042',
        tenantId: 6,
        status: 'shadow_draft',
        createdAt: '2026-08-02T13:30:00-03:00',
        sourceFlightReference: 'cv_voos:42',
        operator: {
          legalName: 'Operador de Teste',
          legalIdentifier: '00000000000000',
          operatingCertificate: null,
        },
        owner: { legalName: null, legalIdentifier: null },
        aircraft: {
          manufacturer: 'Leonardo',
          model: 'AW139',
          serialNumber: null,
          registration: 'PR-TST',
        },
        volumeNumber: null,
        legs: [leg(1, 'SBRJ', 'SBSP')],
        technicalStatus: {
          lastMaintenanceIntervention: null,
          nextMaintenanceIntervention: null,
          airframeHoursRemaining: null,
          returnToServiceReference: null,
          openDiscrepancyCount: null,
          source: { kind: 'UNKNOWN' },
        },
      },
      findings: [],
      fieldSources: [
        {
          path: 'operator.legalName',
          source: {
            kind: 'AIRTRUST_CONTROL_FLIGHTS',
            reference: 'cv_voos:42',
          },
        },
      ],
      ...overrides,
    },
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/controle-voos?edb-shadow=1']}>
      <EdbShadowPrototype />
    </MemoryRouter>,
  );
}

async function submitFlight(flightId = '42') {
  fireEvent.change(screen.getByLabelText('Identificação do voo'), {
    target: { value: flightId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Carregar preview shadow' }));
}

describe('protótipo eDB shadow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza a identificação não oficial persistente', () => {
    renderPage();
    expect(
      screen.getAllByText('NÃO OFICIAL — PROTÓTIPO SHADOW — SEM VALOR REGULATÓRIO'),
    ).toHaveLength(2);
  });

  it('carrega voo válido e exibe múltiplas etapas', async () => {
    const payload = validPayload();
    payload.data.draft.legs = [leg(1, 'SBRJ', 'SBSP'), leg(2, 'SBSP', 'SBCF')];
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(jsonResponse(payload));

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Resumo do voo')).toBeInTheDocument());
    expect(screen.getByText('Etapa 1: SBRJ → SBSP')).toBeInTheDocument();
    expect(screen.getByText('Etapa 2: SBSP → SBCF')).toBeInTheDocument();
    expect(screen.getByText('Tripulante 1 · P1')).toBeInTheDocument();
  });

  it('mantém campos ausentes como não disponíveis e mostra alertas do backend', async () => {
    const payload = validPayload({
      findings: [
        { code: 'AIRCRAFT_SERIAL_NUMBER_REQUIRED', path: 'aircraft.serialNumber' },
        { code: 'SOURCE_CONFLICT_OPEN', path: 'conflicts.0' },
      ],
    });
    payload.data.draft.aircraft.serialNumber = null;
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(jsonResponse(payload));

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Dados incompletos')).toBeInTheDocument());
    expect(screen.getByText('Número de série ausente')).toBeInTheDocument();
    expect(screen.getByText('Conflito de fonte aberto')).toBeInTheDocument();
    expect(screen.getAllByText('Não disponível').length).toBeGreaterThan(0);
  });

  it('distingue procedência transcrita, calculada, normalizada e incompleta', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(jsonResponse(validPayload()));

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Procedência')).toBeInTheDocument());
    expect(screen.getAllByText(/Dado transcrito da fonte/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dado calculado/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dado normalizado/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Procedência incompleta/).length).toBeGreaterThan(0);
    expect(screen.queryByText('cv_voos:42')).not.toBeInTheDocument();
  });

  it('mostra acesso negado sem expor detalhes técnicos', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: 'Permissao insuficiente',
          code: 'EDB_SHADOW_PREVIEW_RBAC_FORBIDDEN',
        },
        false,
        403,
      ),
    );

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Acesso negado')).toBeInTheDocument());
    expect(screen.queryByText('EDB_SHADOW_PREVIEW_RBAC_FORBIDDEN')).not.toBeInTheDocument();
  });

  it('trata voo ausente e tentativa fora do tenant com a mesma resposta segura', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: 'Voo nao encontrado',
          code: 'EDB_SHADOW_PREVIEW_FLIGHT_NOT_FOUND',
        },
        false,
        404,
      ),
    );

    renderPage();
    await submitFlight();

    await waitFor(() =>
      expect(screen.getByText('Voo não encontrado no tenant atual')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/não existe ou não pertence ao escopo empresarial/i),
    ).toBeInTheDocument();
  });

  it('mostra contrato incompatível para resposta fora de edb.draft.v1', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse({ success: true, data: { classification: 'UNKNOWN', draft: {} } }),
    );

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Contrato incompatível')).toBeInTheDocument());
  });

  it('sanitiza erro interno e não mostra stack, SQL, token ou payload', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: 'SQLITE_ERROR SELECT secret FROM tenants',
          stack: 'stack trace',
          token: 'Bearer secret',
          payload: { empresa_id: 6 },
        },
        false,
        500,
      ),
    );

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Erro interno')).toBeInTheDocument());
    expect(screen.queryByText(/SQLITE_ERROR/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/stack trace/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bearer secret/i)).not.toBeInTheDocument();
  });

  it('mostra erro de rede sanitizado', async () => {
    vi.mocked(fetchWithAuth).mockRejectedValueOnce(new Error('socket details'));

    renderPage();
    await submitFlight();

    await waitFor(() => expect(screen.getByText('Erro de rede')).toBeInTheDocument());
    expect(screen.queryByText('socket details')).not.toBeInTheDocument();
  });

  it('usa exclusivamente GET e não contém mutações', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(jsonResponse(validPayload()));

    renderPage();
    await submitFlight('77');

    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/edb/shadow-preview/77', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    expect(source).not.toMatch(/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
    expect(source).not.toMatch(/\.(?:post|put|patch|delete)\s*\(/);
  });
});
