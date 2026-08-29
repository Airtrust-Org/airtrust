import { useEffect, useRef, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsCheckinFadiga, {
  isFadigaCheckinSubmitReady,
  isValidWakeTime,
  mapKssToSubjectiveFatigue,
  normalizeWakeTimeInput,
  optionalBinaryResponseToPayload,
} from '../FrmsFlightCheckinFadiga';
import { resolveFadigaPostSavePath } from '../frmsPostSaveNavigation';
import {
  buildFadigaPainelRequestPath,
  normalizeFadigaPainelDate,
  normalizeFadigaPainelPayload,
  type FadigaPainelEquipeItem,
} from '@/react-app/hooks/useFadigaCheckin';

const mutateAsyncMock = vi.fn();
const readinessMutateAsyncMock = vi.fn();
const refetchMock = vi.fn();
const navigateMock = vi.fn();
const useFadigaHistoricoMock = vi.fn();
const useFadigaPainelMock = vi.fn();
const usePermissionsMock = vi.fn();
let submitPending = false;

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigateMock,
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/components/PageHeader', () => ({
  default: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => usePermissionsMock(),
}));

vi.mock('@/react-app/hooks/useFadigaCheckin', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useFadigaCheckin')>(
    '@/react-app/hooks/useFadigaCheckin',
  );
  return {
    ...actual,
    useCheckinHoje: () => ({ data: null, refetch: refetchMock }),
    useSubmitCheckin: () => ({ mutateAsync: mutateAsyncMock, isPending: submitPending }),
    useFadigaHistorico: (...args: unknown[]) => useFadigaHistoricoMock(...args),
    useFadigaPainel: (...args: unknown[]) => useFadigaPainelMock(...args),
  };
});

vi.mock('@/react-app/hooks/useOperationalReadiness', () => ({
  useReadinessBaseline: () => ({ data: { sessions: 0, minimum_sessions: 5, ready: false } }),
  useReadinessToday: () => ({ data: null }),
  useSubmitReadiness: () => ({ mutateAsync: readinessMutateAsyncMock, isPending: false }),
}));

const recoverySubmitMock = vi.fn();
vi.mock('@/react-app/hooks/useFrmsRecovery', async () => {
  const actual = await vi.importActual<typeof import('@/react-app/hooks/useFrmsRecovery')>(
    '@/react-app/hooks/useFrmsRecovery',
  );
  return {
    ...actual,
    // Default: previous day had a detected flight, so the recovery card stays
    // collapsed and does not ask for an activity classification.
    useFrmsRecoveryContext: () => ({
      data: {
        reference_date: '2026-06-04',
        schema_ready: true,
        flight: {
          detected: true,
          sectorCount: 2,
          landingCount: 2,
          canonicalFlightMinutes: 210,
          source: 'SIGVOOS',
        },
        requires_activity_classification: false,
        activity: null,
        assessment: null,
        prompt_reason: 'FLIGHT_DETECTED',
      },
      isLoading: false,
      isError: false,
    }),
    useSubmitFrmsRecoveryActivity: () => ({ mutateAsync: recoverySubmitMock, isPending: false }),
  };
});

vi.mock('../OperationalVigilanceTest', () => ({
  default: ({ onComplete }: { onComplete: (result: unknown) => void }) => {
    const completedRef = useRef(false);
    useEffect(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onComplete({
        summary: {
          protocolVersion: 'airtrust-vigilance-v1',
          durationMs: 180000,
          completedTrials: 1,
          validResponses: 1,
          medianReactionTimeMs: 280,
          meanReactionTimeMs: 280,
          p90ReactionTimeMs: 280,
          reactionTimeStdDevMs: 0,
          lapses: 0,
          falseStarts: 0,
          missed: 0,
          responseSpeedPerSecond: 3.571,
          trials: [],
        },
        trials: [
          {
            sequence: 1,
            scheduledAtMs: 1000,
            stimulusAtMs: 1100,
            responseAtMs: 1380,
            reactionTimeMs: 280,
            outcome: 'response',
          },
        ],
      });
    }, [onComplete]);
    return <div data-testid="mock-vigilance-test">Teste cognitivo simulado</div>;
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('FrmsCheckinFadiga helpers', () => {
  it('permite submissao com aptidao sim sem observacao', () => {
    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'h8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fitForDutyChoice: 'sim',
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: '',
      }),
    ).toBe(true);
  });

  it('exige observacao quando aptidao nao ou coordenacao', () => {
    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'h8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fitForDutyChoice: 'nao',
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: '',
      }),
    ).toBe(false);

    expect(
      isFadigaCheckinSubmitReady({
        sonoOpcao: 'h8',
        wakeTime: '05:30',
        qualidadeSono: 4,
        kssScore: 3,
        fitForDutyChoice: 'coord',
        aceiteTermos: true,
        aceitePrivacidade: true,
        observacao: 'Preciso revisar antes da jornada',
      }),
    ).toBe(true);
  });

  it('preserva null no payload opcional', () => {
    expect(optionalBinaryResponseToPayload(null)).toBeNull();
    expect(optionalBinaryResponseToPayload(true)).toBe(true);
    expect(optionalBinaryResponseToPayload(false)).toBe(false);
  });

  it('mapeia KSS para escala subjetiva legado-compativel', () => {
    expect(mapKssToSubjectiveFatigue(1)).toBe(1);
    expect(mapKssToSubjectiveFatigue(3)).toBe(3);
    expect(mapKssToSubjectiveFatigue(5)).toBe(5);
    expect(mapKssToSubjectiveFatigue(7)).toBe(8);
    expect(mapKssToSubjectiveFatigue(9)).toBe(10);
  });

  it('normaliza wake time em formatos aceitos', () => {
    expect(normalizeWakeTimeInput('1230')).toBe('12:30');
    expect(normalizeWakeTimeInput('0730')).toBe('07:30');
    expect(normalizeWakeTimeInput('730')).toBe('07:30');
    expect(normalizeWakeTimeInput('0630')).toBe('06:30');
    expect(normalizeWakeTimeInput('7:30')).toBe('07:30');
    expect(normalizeWakeTimeInput('07h00')).toBe('07:00');
    expect(normalizeWakeTimeInput('7h30')).toBe('07:30');
  });

  it('rejeita wake time incompleto ou invalido', () => {
    expect(normalizeWakeTimeInput('')).toBeNull();
    expect(normalizeWakeTimeInput('07')).toBeNull();
    expect(normalizeWakeTimeInput('7')).toBeNull();
    expect(normalizeWakeTimeInput('2360')).toBeNull();
    expect(normalizeWakeTimeInput('2400')).toBeNull();
    expect(normalizeWakeTimeInput('9999')).toBeNull();
  });

  it('valida faixa e formato aceitos para wake time', () => {
    expect(isValidWakeTime('00:00')).toBe(true);
    expect(isValidWakeTime('06:30')).toBe(true);
    expect(isValidWakeTime('23:59')).toBe(true);
    expect(isValidWakeTime('700')).toBe(true);
    expect(isValidWakeTime('7h30')).toBe(true);
    expect(isValidWakeTime('00:80')).toBe(false);
    expect(isValidWakeTime('24:00')).toBe(false);
    expect(isValidWakeTime('25:61')).toBe(false);
    expect(isValidWakeTime('6')).toBe(false);
  });

  it('resolve destino correto apos salvar fadiga por perfil, mantendo navegacao dentro do FRMS', () => {
    expect(resolveFadigaPostSavePath('INSTRUTOR')).toBe('/frms/checkin?tab=historico');
    expect(resolveFadigaPostSavePath('ALUNO')).toBe('/frms/checkin?tab=historico');
    expect(resolveFadigaPostSavePath('TRIPULANTE')).toBe('/frms/checkin?tab=historico');
    expect(resolveFadigaPostSavePath('GESTOR')).toBe('/frms/controle-operacional');
    expect(resolveFadigaPostSavePath('ADMINISTRADOR')).toBe('/frms/controle-operacional');
  });
});

describe('FrmsCheckinFadiga team panel adapter', () => {
  const canonicalItems = [
    ['bb2a03a5', 3, 'Antonio Luiz Simões Ramos', 3, 13],
    ['7b2bf012', 41, 'Filipe Passaroni Daumas', 3, 13],
    ['49d52917', 38, 'Gabriel Ferreira Barreto', 3, 9],
    ['243a1652', 15, 'José Alfredo Gomes Marinho', 1, 0],
    ['5fa8ffaa', 33, 'Wilson Maciel Martins Nery', 1, 4],
  ].map(([checkin_id, funcionario_id, funcionario_nome, kss_score, score_fadiga]) => ({
    checkin_id,
    funcionario_id,
    funcionario_nome,
    date: '2026-06-05',
    status: 'normal',
    data_source: 'crew_reported',
    kss_score,
    sleep_hours_24h: 7,
    score_fadiga,
    nivel_fadiga: 'VERDE',
    status_operacional: 'APTO',
  }));

  it('monta request canônica com data ISO e scope=team', () => {
    expect(normalizeFadigaPainelDate('05/06/2026')).toBe('2026-06-05');
    expect(buildFadigaPainelRequestPath('05/06/2026')).toBe(
      '/frms/daily-fatigue?date=2026-06-05&scope=team',
    );
  });

  it('normaliza o shape canônico real com 5 check-ins de 2026-06-05', () => {
    const rows = normalizeFadigaPainelPayload({ date: '2026-06-05', items: canonicalItems }, '2026-06-05');

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.funcionario_nome)).toEqual([
      'Antonio Luiz Simões Ramos',
      'Filipe Passaroni Daumas',
      'Gabriel Ferreira Barreto',
      'José Alfredo Gomes Marinho',
      'Wilson Maciel Martins Nery',
    ]);
    expect(rows.every((row) => row.status === 'normal')).toBe(true);
  });

  it('não converte resposta individual ou shape inesperado em lista vazia', () => {
    const individualPayload = {
      date: '2026-06-05',
      funcionario_id: 41,
    } as unknown as Parameters<typeof normalizeFadigaPainelPayload>[0];

    expect(() =>
      normalizeFadigaPainelPayload(individualPayload, '2026-06-05'),
    ).toThrow(/escopo individual/i);

    expect(() => normalizeFadigaPainelPayload({ date: '2026-06-05' }, '2026-06-05')).toThrow(
      /Formato inesperado/i,
    );
  });
});

describe('FrmsCheckinFadiga UI', () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    readinessMutateAsyncMock.mockReset();
    refetchMock.mockReset();
    navigateMock.mockReset();
    useFadigaHistoricoMock.mockReset();
    useFadigaPainelMock.mockReset();
    usePermissionsMock.mockReset();
    submitPending = false;
    mutateAsyncMock.mockResolvedValue({ data: { requires_frat_review: 0 } });
    readinessMutateAsyncMock.mockResolvedValue({
      assessmentId: 'readiness-1',
      classification: 'baseline_building',
      baselineSessions: 0,
      baselineReady: false,
      warningSignals: [],
      criticalSignals: [],
    });
    refetchMock.mockResolvedValue(undefined);
    useFadigaHistoricoMock.mockReturnValue({ data: { data: [] }, isLoading: false });
    useFadigaPainelMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, role: 'INSTRUTOR' });
  });

  function preencherFormularioValido() {
    fireEvent.click(screen.getByRole('radio', { name: '8 horas' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));
  }

  it('renderiza KSS com titulo claro e descritores', () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.getByText('Bloco 2 - Sonolência agora')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quão sonolento ou alerta você está agora? Escolha a opção que melhor descreve seu estado neste momento.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Escala KSS (1-9)')).toBeInTheDocument();
    expect(screen.getByText(/Extremamente alerta/)).toBeInTheDocument();
  });

  it('renderiza qualidade do sono com niveis e descritores claros', () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.getByLabelText('Qualidade 5 - Excelente')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 4 - Boa')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 3 - Regular')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 2 - Ruim')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade 1 - Péssima')).toBeInTheDocument();
    expect(screen.getByText('Dormi muito bem; acordei descansado e recuperado.')).toBeInTheDocument();
  });

  it('renderiza as escalas graduais da melhor condição para a pior', () => {
    render(<FrmsCheckinFadiga />);

    const sonoFieldset = screen.getAllByText('Horas de sono nas últimas 24h')[1]?.closest('fieldset');
    expect(sonoFieldset).toBeTruthy();
    expect(within(sonoFieldset as HTMLElement).getAllByRole('radio').map((input) => (input as HTMLInputElement).value)).toEqual([
      'mais9',
      'h9',
      'h8',
      'h7',
      'h6',
      'h5',
      'h4',
      'menos4',
    ]);
    expect(within(sonoFieldset as HTMLElement).getAllByRole('radio').map((input) => (input as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual([
      'Mais de 9 horas',
      '9 horas',
      '8 horas',
      '7 horas',
      '6 horas',
      '5 horas',
      '4 horas',
      'Menos de 4 horas',
    ]);

    const qualidadeFieldset = screen.getAllByText('Qualidade do sono')[1]?.closest('fieldset');
    expect(qualidadeFieldset).toBeTruthy();
    expect(within(qualidadeFieldset as HTMLElement).getAllByRole('radio').map((input) => (input as HTMLInputElement).value)).toEqual([
      '5',
      '4',
      '3',
      '2',
      '1',
    ]);

    const kssFieldset = screen.getByText('Escala KSS (1-9)').closest('fieldset');
    expect(kssFieldset).toBeTruthy();
    expect(within(kssFieldset as HTMLElement).getAllByRole('radio').map((input) => (input as HTMLInputElement).value)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(screen.getByLabelText('KSS 1: Extremamente alerta')).toBeInTheDocument();
    expect(
      screen.getByLabelText('KSS 9: Extremamente sonolento, com grande esforço para permanecer acordado'),
    ).toBeInTheDocument();

    expect(within(sonoFieldset as HTMLElement).getAllByRole('radio')).toHaveLength(8);
  });

  it('mantem a ordem semântica original da pergunta de aptidão, sem tratar coordenação como escala ordinal', () => {
    render(<FrmsCheckinFadiga />);

    const aptidaoFieldset = screen.getByText('Você se sente em condição segura para iniciar a jornada?').closest('fieldset');
    expect(aptidaoFieldset).toBeTruthy();
    expect(within(aptidaoFieldset as HTMLElement).getAllByRole('radio').map((input) => (input as HTMLInputElement).value)).toEqual([
      'sim',
      'nao',
      'coord',
    ]);
    expect(within(aptidaoFieldset as HTMLElement).getAllByRole('radio').map((input) => (input as HTMLInputElement).labels?.[0]?.textContent?.trim())).toEqual([
      'Sim, consigo iniciar a jornada com segurança',
      'Não, preciso revisão com a coordenação',
      'Preciso falar com a coordenação',
    ]);
  });

  it('mantem o fluxo utilizável em viewport de celular', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 375 });
    window.dispatchEvent(new Event('resize'));

    render(<FrmsCheckinFadiga />);

    expect(screen.getByRole('radio', { name: 'Mais de 9 horas' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '8 horas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toHaveClass('w-full');
  });

  it('remove sintomas redundantes da UI', () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.queryByText('Sintomas atuais')).not.toBeInTheDocument();
    expect(screen.queryByText('Concentração reduzida')).not.toBeInTheDocument();
    expect(screen.queryByText(/48h/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nível subjetivo de fadiga/i)).not.toBeInTheDocument();
  });

  it('envia payload minimo valido e compativel com null em meds/alcool', async () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '8 horas' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);

    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    fireEvent.click(document.getElementById('meds-ult-12h-sim') as HTMLElement);
    fireEvent.click(document.getElementById('meds-ult-12h-prefiro-nao') as HTMLElement);
    fireEvent.click(document.getElementById('alcool-ult-12h-sim') as HTMLElement);
    fireEvent.click(document.getElementById('alcool-ult-12h-prefiro-nao') as HTMLElement);

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readinessMutateAsyncMock).toHaveBeenCalledTimes(1));

    const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
    const readinessPayload = readinessMutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
    expect(readinessPayload.duration_ms).toBe(180000);
    expect(readinessPayload.trials).toHaveLength(1);

    expect(payload.kss_score).toBe(3);
    expect(payload.horas_sono_24h).toBe(8);
    expect(payload.qualidade_sono).toBe(4);
    expect(payload.wake_time).toBe('05:30');
    expect(payload.hora_acordou).toBe('05:30');
    expect(payload.fit_for_duty).toBe(true);
    expect(payload.meds_ult_12h).toBeNull();
    expect(payload.alcool_ult_12h).toBeNull();
    expect(payload.subjective_fatigue_level).toBe(3);
    expect(payload.sleepiness_level).toBe(3);
    expect(payload).not.toHaveProperty('sintomas');
    expect(payload).not.toHaveProperty('horas_sono_48h');
    expect(payload.motivo_inaptidao).toBeUndefined();
  });

  it('envia o valor canônico correto para cada alternativa visual de sono', async () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));
    const submitButton = screen.getByRole('button', { name: 'Confirmar Check-in Diário' });

    const casos = [
      ['Mais de 9 horas', 9.5],
      ['9 horas', 9],
      ['8 horas', 8],
      ['7 horas', 7],
      ['6 horas', 6],
      ['5 horas', 5],
      ['4 horas', 4],
      ['Menos de 4 horas', 3.5],
    ] as const;

    for (const [label, horas] of casos) {
      mutateAsyncMock.mockClear();
      fireEvent.click(screen.getByRole('radio', { name: label }));
      fireEvent.click(submitButton);

      await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
      const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.horas_sono_24h).toBe(horas);
    }
  });

  it('preserva os valores internos de qualidade do sono e KSS no payload', async () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: 'Mais de 9 horas' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));
    const submitButton = screen.getByRole('button', { name: 'Confirmar Check-in Diário' });

    const casos = [
      ['Qualidade 5 - Excelente', 'KSS 1: Extremamente alerta', 5, 1],
      [
        'Qualidade 1 - Péssima',
        'KSS 9: Extremamente sonolento, com grande esforço para permanecer acordado',
        1,
        9,
      ],
    ] as const;

    for (const [qualidadeLabel, kssLabel, qualidadeEsperada, kssEsperado] of casos) {
      mutateAsyncMock.mockClear();
      fireEvent.click(screen.getByLabelText(qualidadeLabel));
      fireEvent.click(screen.getByLabelText(kssLabel));
      fireEvent.click(submitButton);

      await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
      const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.qualidade_sono).toBe(qualidadeEsperada);
      expect(payload.kss_score).toBe(kssEsperado);
    }
  });

  it('sucesso de instrutor fecha formulario e volta para home correta', async () => {
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/frms/checkin?tab=historico', { replace: true }));
  });

  it('sucesso de aluno/tripulante volta para home correta', async () => {
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: false, role: 'ALUNO' });
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/frms/checkin?tab=historico', { replace: true }));
  });

  it('erro de envio permanece no formulario sem redirecionar', async () => {
    mutateAsyncMock.mockRejectedValueOnce(new Error('Falha segura'));
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('evita double submit quando mutation esta pendente', () => {
    submitPending = true;
    render(<FrmsCheckinFadiga />);

    preencherFormularioValido();
    const submitButton = screen.getByRole('button', { name: 'Confirmar Check-in Diário' });
    expect(submitButton).toBeDisabled();
    fireEvent.click(submitButton);

    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('mantem observacao obrigatoria para resposta nao apto', () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '5 horas' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 3 - Regular'));
    fireEvent.click(screen.getByLabelText('KSS 6: Alguns sinais de sonolência'));
    fireEvent.click(document.getElementById('fit-choice-nao') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    expect(screen.getByText(/observação é obrigatória/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Explique o motivo para revisão pela coordenação'), {
      target: { value: 'Não dormi adequadamente e preciso revisar com a coordenação.' },
    });

    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toBeEnabled();
  });

  it('inicia vazio e normaliza wake time no blur', () => {
    render(<FrmsCheckinFadiga />);

    const wakeInput = screen.getByLabelText('Hora em que acordou') as HTMLInputElement;
    expect(wakeInput.value).toBe('');

    fireEvent.change(wakeInput, { target: { value: '0700' } });
    expect(wakeInput.value).toBe('0700');
    fireEvent.blur(wakeInput);
    expect(wakeInput.value).toBe('07:00');

    fireEvent.change(wakeInput, { target: { value: '700' } });
    expect(wakeInput.value).toBe('700');
    fireEvent.blur(wakeInput);
    expect(wakeInput.value).toBe('07:00');

    fireEvent.change(wakeInput, { target: { value: '7h30' } });
    fireEvent.blur(wakeInput);
    expect(wakeInput.value).toBe('07:30');

    fireEvent.change(wakeInput, { target: { value: '' } });
    expect(wakeInput.value).toBe('');
  });

  it('exibe indicador de pendencias quando formulario incompleto', () => {
    render(<FrmsCheckinFadiga />);

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/respostas pendentes/);
    expect(status).toHaveTextContent(/Horas de sono/);
    expect(status).toHaveTextContent(/Qualidade do sono/);
    expect(status).toHaveTextContent(/e mais/);
  });

  it('remove indicador de pendencias quando formulario completo', async () => {
    render(<FrmsCheckinFadiga />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: '8 horas' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0530' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('usa fieldset e legend para agrupamento semantico com radios nativos', () => {
    render(<FrmsCheckinFadiga />);

    // fieldset provides group semantics; native radio names create the radio group
    expect(screen.getByRole('radio', { name: '8 horas' })).toHaveAttribute('name', 'sono-24h');
    expect(screen.getByLabelText('Qualidade 3 - Regular')).toHaveAttribute('name', 'qualidade-sono');
    expect(screen.getByLabelText('KSS 5: Nem alerta nem sonolento')).toHaveAttribute('name', 'kss');
  });

  it('renderiza radios em cards estruturados (block/flex + w-full)', () => {
    render(<FrmsCheckinFadiga />);

    const qualidadeInput = screen.getByLabelText('Qualidade 4 - Boa');
    const qualidadeLabel = qualidadeInput.closest('label');
    expect(qualidadeLabel).toBeTruthy();
    expect(qualidadeLabel).toHaveClass('block');
    expect(qualidadeLabel).toHaveClass('w-full');

    const kssInput = screen.getByLabelText('KSS 8: Sonolento, com esforço para permanecer acordado');
    const kssLabel = kssInput.closest('label');
    expect(kssLabel).toBeTruthy();
    expect(kssLabel).toHaveClass('block');
    expect(kssLabel).toHaveClass('w-full');

    const medsLabel = document.getElementById('meds-ult-12h-sim');
    expect(medsLabel).toBeTruthy();
    expect(medsLabel).toHaveClass('flex');
    expect(medsLabel).toHaveClass('w-full');
  });

  it('mantem radios nativos sem atributos aria custom de role radio', () => {
    const { container } = render(<FrmsCheckinFadiga />);
    expect(container.querySelector('[role="radio"]')).toBeNull();
    expect(container.querySelector('[aria-checked]')).toBeNull();
    expect(container.querySelector('[aria-pressed]')).toBeNull();
  });

  it('exibe borda vermelha e aria-invalid em horario invalido', () => {
    render(<FrmsCheckinFadiga />);

    const wakeInput = screen.getByLabelText('Hora em que acordou');
    fireEvent.change(wakeInput, { target: { value: '2400' } });
    fireEvent.blur(wakeInput);

    expect(wakeInput).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Informe um horário válido no formato HH:mm. Minutos devem ficar entre 00 e 59.'),
    ).toBeInTheDocument();
  });

  it('bloqueia envio quando horario e invalido e mostra mensagem clara', () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '8 horas' }));
    const wakeInput = screen.getByLabelText('Hora em que acordou');
    fireEvent.change(wakeInput, { target: { value: '2400' } });
    fireEvent.blur(wakeInput);
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));

    expect(
      screen.getByText('Informe um horário válido no formato HH:mm. Minutos devem ficar entre 00 e 59.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar Check-in Diário' })).toBeDisabled();
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('submete 0630 como 06:30', async () => {
    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('radio', { name: '8 horas' }));
    fireEvent.change(screen.getByLabelText('Hora em que acordou'), { target: { value: '0630' } });
    fireEvent.click(screen.getByLabelText('Qualidade 4 - Boa'));
    fireEvent.click(screen.getByLabelText('KSS 3: Alerta'));
    fireEvent.click(document.getElementById('fit-choice-sim') as HTMLElement);
    fireEvent.click(screen.getByRole('checkbox', { name: /As informações fornecidas são verídicas/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Aceito o uso dos dados no FRMS/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Check-in Diário' }));

    await waitFor(() => expect(mutateAsyncMock).toHaveBeenCalledTimes(1));
    const payload = mutateAsyncMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.wake_time).toBe('06:30');
    expect(payload.hora_acordou).toBe('06:30');
  });

  it('renderiza status operacional com rotulos seguros na aba Histórico', () => {
    useFadigaHistoricoMock.mockReturnValue({
      data: {
        data: [
          {
            id: 'chk-1',
            data_checkin: '2026-05-29',
            kss_score: 8,
            horas_sono: 4.5,
            score_fadiga: 82,
            nivel_fadiga: 'VERMELHO',
            status_operacional: 'INAPTO',
          },
        ],
      },
      isLoading: false,
    });

    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('button', { name: 'Histórico' }));

    expect(screen.getByText('Requer revisão operacional')).toBeInTheDocument();
    expect(screen.queryByText(/^INAPTO$/)).not.toBeInTheDocument();
  });

  it('mantem disclaimer de triagem operacional no check-in', () => {
    render(<FrmsCheckinFadiga />);
    expect(screen.getByText(/Ferramenta de triagem operacional/i)).toBeInTheDocument();
    expect(screen.getByText(/não determina automaticamente aptidão ou restrição operacional/i)).toBeInTheDocument();
  });

  it('na aba Equipe renderiza os 5 check-ins reais de 05/06/2026 quando a query retorna dados', async () => {
    const equipeRows: FadigaPainelEquipeItem[] = [
      {
        id: 'daily-fatigue-3',
        funcionario_id: 3,
        funcionario_nome: 'Antonio Luiz Simões Ramos',
        cargo: 'Comandante',
        data: '2026-06-05',
        status: 'normal',
        data_source: 'crew_reported',
        kss_score: 3,
        score_fadiga: 13,
        nivel_fadiga: 'VERDE',
        status_operacional: 'APTO',
      },
      {
        id: 'daily-fatigue-41',
        funcionario_id: 41,
        funcionario_nome: 'Filipe Passaroni Daumas',
        cargo: 'Comandante',
        data: '2026-06-05',
        status: 'normal',
        data_source: 'crew_reported',
        kss_score: 3,
        score_fadiga: 13,
        nivel_fadiga: 'VERDE',
        status_operacional: 'APTO',
      },
      {
        id: 'daily-fatigue-38',
        funcionario_id: 38,
        funcionario_nome: 'Gabriel Ferreira Barreto',
        cargo: 'Copiloto',
        data: '2026-06-05',
        status: 'normal',
        data_source: 'crew_reported',
        kss_score: 3,
        score_fadiga: 9,
        nivel_fadiga: 'VERDE',
        status_operacional: 'APTO',
      },
      {
        id: 'daily-fatigue-15',
        funcionario_id: 15,
        funcionario_nome: 'José Alfredo Gomes Marinho',
        cargo: 'Comandante',
        data: '2026-06-05',
        status: 'normal',
        data_source: 'crew_reported',
        kss_score: 1,
        score_fadiga: 0,
        nivel_fadiga: 'VERDE',
        status_operacional: 'APTO',
      },
      {
        id: 'daily-fatigue-33',
        funcionario_id: 33,
        funcionario_nome: 'Wilson Maciel Martins Nery',
        cargo: 'Comandante',
        data: '2026-06-05',
        status: 'normal',
        data_source: 'crew_reported',
        kss_score: 1,
        score_fadiga: 4,
        nivel_fadiga: 'VERDE',
        status_operacional: 'APTO',
      },
    ];
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: true, role: 'GESTOR' });
    useFadigaPainelMock.mockReturnValue({
      data: equipeRows,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }));

    expect(await screen.findByText('Antonio Luiz Simões Ramos')).toBeInTheDocument();
    expect(await screen.findByText('Filipe Passaroni Daumas')).toBeInTheDocument();
    expect(screen.getByText('Gabriel Ferreira Barreto')).toBeInTheDocument();
    expect(screen.getByText('José Alfredo Gomes Marinho')).toBeInTheDocument();
    expect(screen.getByText('Wilson Maciel Martins Nery')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum check-in registrado para esta data.')).not.toBeInTheDocument();
  });

  it('na aba Equipe troca de data refaz consulta com 2026-06-05', async () => {
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: true, role: 'GESTOR' });

    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }));
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-06-05' } });

    await waitFor(() => {
      expect(useFadigaPainelMock).toHaveBeenLastCalledWith('2026-06-05');
    });
  });

  it('na aba Equipe mostra erro claro e nao converte falha em lista vazia', async () => {
    const refetchPainel = vi.fn();
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: true, role: 'GESTOR' });
    useFadigaPainelMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Erro ao carregar check-ins da equipe.'),
      refetch: refetchPainel,
      isFetching: false,
    });

    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }));

    expect(await screen.findByText('Erro ao carregar check-ins da equipe.')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum check-in registrado para esta data.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetchPainel).toHaveBeenCalledTimes(1);
  });

  it('na aba Equipe mostra vazio apenas quando a request teve sucesso e voltou sem registros', async () => {
    usePermissionsMock.mockReturnValue({ isAdmin: false, isGestor: true, role: 'GESTOR' });

    render(<FrmsCheckinFadiga />);

    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }));

    expect(await screen.findByText('Nenhum check-in registrado para esta data.')).toBeInTheDocument();
  });
});