/**
 * Testes de validade — CardMeusEAD
 *
 * Regressão: `diasParaVencer`/`formatarData` compunham uma data civil
 * (data_vencimento_qualificacao, YYYY-MM-DD) com `Date.now()` via
 * `new Date(iso).getTime()`. Em fusos com offset negativo (America/Sao_Paulo,
 * UTC-3), o PRÓPRIO DIA do vencimento já aparecia "Vencida" horas antes da
 * meia-noite local, e `formatarData` podia exibir o dia anterior ao real.
 *
 * Regra correta: comparação civil-a-civil; o dia do vencimento ainda é válido;
 * só o dia seguinte é "Vencida".
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardMeusEAD } from '@/react-app/components/dashboard/CardMeusEAD';
import { useMinhasEAD } from '@/react-app/hooks/useLms';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import type { LmsMatriculaEAD } from '@/react-app/hooks/useLms';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/react-app/config/api', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/config/api')>('@/react-app/config/api');
  return { ...actual, fetchWithAuth: vi.fn() };
});

vi.mock('@/react-app/utils/certificadoDownload', () => ({
  baixarCertificadoCanonico: vi.fn(),
  resolveCertificadoDocumentoId: () => null,
}));

vi.mock('@/react-app/hooks/useLms', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useLms')>(
    '@/react-app/hooks/useLms',
  );
  return { ...actual, useMinhasEAD: vi.fn() };
});

vi.mock('@/react-app/hooks/usePermissions', () => ({ usePermissions: vi.fn() }));

const useMinhasEADMock = vi.mocked(useMinhasEAD);
const usePermissionsMock = vi.mocked(usePermissions);

function matricula(overrides: Partial<LmsMatriculaEAD> = {}): LmsMatriculaEAD {
  return {
    id: 1,
    empresa_id: 6,
    curso_id: 10,
    funcionario_id: 1,
    status: 'CONCLUIDO',
    progresso_pct: 100,
    score_final: 100,
    tentativas: 1,
    data_matricula: '2026-01-01',
    data_inicio: '2026-01-01',
    data_conclusao: '2026-01-05',
    data_expiracao: null,
    qualificacao_historico_id: 900,
    observacoes: null,
    titulo: 'Curso com validade',
    data_vencimento_qualificacao: null,
    tem_certificado: 0,
    ...overrides,
  } as LmsMatriculaEAD;
}

function renderCard() {
  return render(
    <MemoryRouter>
      <CardMeusEAD />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  usePermissionsMock.mockReturnValue({
    isAluno: true,
    isInstrutor: false,
  } as unknown as ReturnType<typeof usePermissions>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CardMeusEAD — validade (dia do vencimento ainda válido, fuso -03)', () => {
  it('o próprio dia do vencimento NÃO é exibido como vencida (tarde em UTC, ainda o mesmo dia em São Paulo)', () => {
    // 2026-07-30T20:00:00Z = 2026-07-30T17:00:00-03:00 (ainda dia 30 em SP).
    // dias=0 cai na faixa "urgente" (0-7 dias) — o que importa aqui é que
    // NÃO é tratado como vencido (regressão: antes virava vencida horas antes
    // da meia-noite local).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T20:00:00Z'));

    useMinhasEADMock.mockReturnValue({
      data: [matricula({ data_vencimento_qualificacao: '2026-07-30' })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText(/Vence em 0 dias/)).toBeInTheDocument();
    expect(screen.queryByText(/Vencida/)).not.toBeInTheDocument();
  });

  it('o dia seguinte ao vencimento é exibido como vencida', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T13:00:00Z')); // 10:00 em São Paulo, dia 31

    useMinhasEADMock.mockReturnValue({
      data: [matricula({ data_vencimento_qualificacao: '2026-07-30' })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText(/Vencida em 30\/07\/2026/)).toBeInTheDocument();
  });

  it('formatarData nunca regride um dia por conversão de fuso (virada de mês)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    useMinhasEADMock.mockReturnValue({
      data: [matricula({ data_vencimento_qualificacao: '2026-02-01' })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    // Antes da correção, new Date('2026-02-01') formatado em fuso -03 podia
    // exibir 31/01/2026 em vez de 01/02/2026.
    expect(screen.getByText(/Válida até 01\/02\/2026/)).toBeInTheDocument();
  });

  it('ano bissexto: 29/02 ainda válido no próprio dia (não vencida)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-02-29T22:00:00Z')); // ainda 29/02 em São Paulo (-03)

    useMinhasEADMock.mockReturnValue({
      data: [matricula({ data_vencimento_qualificacao: '2028-02-29' })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText(/Vence em 0 dias/)).toBeInTheDocument();
    expect(screen.queryByText(/Vencida/)).not.toBeInTheDocument();
  });

  it('ano bissexto: 01/03 é exibido com a data correta (29/02 + 1 dia) e não regride para 28/02', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2028-01-01T12:00:00Z'));

    useMinhasEADMock.mockReturnValue({
      data: [matricula({ data_vencimento_qualificacao: '2028-03-01' })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.getByText(/Válida até 01\/03\/2028/)).toBeInTheDocument();
  });

  it('sem Histórico vinculado (data_vencimento_qualificacao null) não exibe vencimento algum', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T20:00:00Z'));

    useMinhasEADMock.mockReturnValue({
      data: [matricula({ data_vencimento_qualificacao: null })],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMinhasEAD>);

    renderCard();

    expect(screen.queryByText(/Vencida/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Válida até/)).not.toBeInTheDocument();
  });
});
