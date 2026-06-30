import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ControleVoosRelatorios from '../ControleVoosRelatorios';
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

const relatoriosSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosRelatorios.tsx'),
  'utf8',
);
const tabelasSource = readFileSync(
  resolve(process.cwd(), 'src/react-app/pages/controle-voos/ControleVoosTabelas.tsx'),
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
  });

  it('remove import de mock das paginas reais e aponta para endpoints reais', () => {
    expect(relatoriosSource).not.toContain('controleVoosMockData');
    expect(tabelasSource).not.toContain('controleVoosMockData');
    expect(relatoriosSource).toContain('/api/controle-voos/relatorios/resumo-operacional');
    expect(tabelasSource).toContain('/api/controle-voos/catalogos/');
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
      expect.stringContaining('/api/controle-voos/relatorios/resumo-operacional?'),
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
});
