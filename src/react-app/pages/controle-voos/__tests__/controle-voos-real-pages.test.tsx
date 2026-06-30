import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ControleVoosRelatorios from '../ControleVoosRelatorios';
import ControleVoosJornadas from '../ControleVoosJornadas';
import ControleVoosTabelas from '../ControleVoosTabelas';
import { fetchWithAuth } from '@/react-app/config/api';

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/ControleVoosPageShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('data=2026-06-30'), vi.fn()],
  };
});

const relatoriosSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosRelatorios.tsx'),
  'utf8',
);
const tabelasSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosTabelas.tsx'),
  'utf8',
);
const jornadasSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosJornadas.tsx'),
  'utf8',
);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('controle voos real pages', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('remove import de mock das paginas reais e aponta para endpoints reais', () => {
    expect(relatoriosSource).not.toContain('controleVoosMockData');
    expect(tabelasSource).not.toContain('controleVoosMockData');
    expect(jornadasSource).not.toContain('controleVoosMockData');
    expect(relatoriosSource).toContain('/api/controle-voos/relatorios/resumo-operacional');
    expect(tabelasSource).toContain('/api/controle-voos/catalogos/');
    expect(jornadasSource).toContain('/api/controle-voos/jornadas');
    expect(jornadasSource).not.toContain('/api/frms/operational-snapshot?');
    expect(jornadasSource).not.toContain('/api/frms/acumulo-frota?mes=');
    expect(jornadasSource).not.toContain('Jornadas — Preview');
  });

  it('carrega relatorios operacionais do endpoint real', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          periodo: { data_inicio: '2026-06-24', data_fim: '2026-06-30' },
          totais: {
            voos: 12,
            horas_voadas: 24.5,
            numero_pousos: 11,
            ciclos: 11,
            combustivel_consumo: 1234,
            voos_sem_rdv: 2,
            rdvs_rascunho: 1,
            rdvs_preenchimento_finalizado: 9,
          },
          totais_por_status: {
            planejado: 3,
            liberado_operacionalmente: 1,
            em_andamento: 1,
            pousado: 1,
            concluido_operacionalmente: 5,
            cancelado: 1,
            alternado_divergido: 0,
          },
          cancelamentos_por_motivo: [{ motivo_id: 1, motivo_nome: 'Meteorologia', total: 1 }],
          atrasos_ou_divergencias: {
            voos_com_atraso_partida: 2,
            voos_com_atraso_chegada: 1,
            voos_alternados_divergidos: 0,
            rdvs_com_divergencias: 1,
          },
          agregados_por_dia: [],
        },
      }),
    );

    render(<ControleVoosRelatorios />);

    expect(screen.getByText('Carregando resumo operacional…')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Voos no período')).toBeInTheDocument());

    expect(vi.mocked(fetchWithAuth)).toHaveBeenCalledWith(
      '/api/controle-voos/relatorios/resumo-operacional?data_inicio=2026-06-30&data_fim=2026-06-30',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Meteorologia')).toBeInTheDocument();
  });

  it('mostra erro quando catalogos reais falham', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValue(
      jsonResponse({ success: false, error: 'Falha no catálogo' }, false, 500),
    );

    render(<ControleVoosTabelas />);

    await waitFor(() =>
      expect(screen.getByText('Erro ao carregar tabelas operacionais.')).toBeInTheDocument(),
    );

    expect(screen.getByText('Falha no catálogo')).toBeInTheDocument();
  });

  it('carrega jornadas do endpoint canonico do Controle de Voos sem usar FRMS', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          periodo: { data_inicio: '2026-06-30', data_fim: '2026-06-30' },
          total: 1,
          items: [
            {
              jornada_id: 'v601-e9001-t9101',
              voo_id: 601,
              etapa_id: 9001,
              external_id_sigvoos: 700101,
              sigvoos_leg_number: 1,
              data_operacional: '2026-06-30',
              tripulante_id: 1001,
              nome: 'Tripulante A',
              funcao: 'PIC',
              funcao_origem: null,
              aeronave: 'ATX-1001',
              origem_icao: 'SBRJ',
              destino_icao: 'SBSP',
              engine_start: '08:00',
              takeoff_time: '08:12',
              landing_time: '09:08',
              engine_shutoff: '09:14',
              tempo_total: '01:14',
              tempo_navegacao: '00:56',
              tempo_ifr: null,
              tempo_noturno: null,
              pousos_diurnos: 1,
              pousos_noturnos: 0,
              starts: 1,
              pax: 10,
              fuel_start: null,
              fuel_end: null,
              origem_dados: 'importado',
              qualidade_dado: 'completo',
              estado_conflito: null,
              evidencia: null,
              last_sync_at: '2026-06-30T12:00:00Z',
            },
          ],
        },
      }),
    );

    render(<ControleVoosJornadas />);

    expect(screen.getByText('Carregando jornadas do Controle de Voos…')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Tripulante A')).toBeInTheDocument());

    expect(vi.mocked(fetchWithAuth)).toHaveBeenCalledWith(
      '/api/controle-voos/jornadas?data=2026-06-30',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByText('SIGVOOS')).toBeInTheDocument();
    expect(screen.getByText('Completo')).toBeInTheDocument();
  });

  it('mostra empty state quando nao ha jornadas no periodo', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          periodo: { data_inicio: '2026-06-30', data_fim: '2026-06-30' },
          total: 0,
          items: [],
        },
      }),
    );

    render(<ControleVoosJornadas />);

    await waitFor(() =>
      expect(screen.getByText(/Nenhuma jornada para/i)).toBeInTheDocument(),
    );
  });
});
