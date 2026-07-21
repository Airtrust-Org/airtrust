import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import ControleVoosRdvStepper from '../components/ControleVoosRdvStepper';
import ControleVoosRdvSaveStatus from '../components/ControleVoosRdvSaveStatus';
import ControleVoosRdvTrechoCard from '../components/ControleVoosRdvTrechoCard';
import ControleVoosCoordenacaoFila from '../ControleVoosCoordenacaoFila';
import { useRdvAutosave } from '../hooks/useRdvAutosave';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { apiClient } from '@/react-app/services/apiClient';
import {
  RDV_PILOT_STEPS,
  aggregateTrechosToFormPatch,
  buildFormState,
  calcConsumoCombustivel,
  calcHorasVoadas,
  clearEtapaPendingRecovery,
  clearTrechoDraft,
  computeProgressPercent,
  draftFromEtapa,
  draftToEtapaPatch,
  duplicateTrecho,
  getStepIndex,
  isStepComplete,
  isVersionConflictError,
  loadEtapaPendingRecovery,
  loadTrechoDraft,
  saveEtapaPendingRecovery,
  saveTrechoDraft,
  seedTrechosFromVoo,
  type RdvFormState,
  type RdvPilotStepId,
} from '../data/rdvPilotFlow';

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/ControleVoosPageShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/ControleVoosPageHeader', () => ({
  default: ({ title, description }: { title: string; description?: string }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}));
vi.mock('@/react-app/services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const baseForm = (): RdvFormState => ({
  numero: 'RDV-20260614-ATX1001',
  data_voo: '2026-06-14',
  horario_decolagem_real: '2026-06-14T10:00',
  horario_pouso_real: '2026-06-14T12:00',
  horas_voadas: '2',
  numero_pousos: '1',
  ciclos: '1',
  combustivel_decolagem: '1000',
  combustivel_pouso: '700',
  combustivel_consumo: '300',
  pob: '4',
  carga_kg: '100',
  ocorrencias: '',
  divergencias: '',
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  clearTrechoDraft(601);
});

describe('rdvPilotFlow domain helpers', () => {
  it('calcula horas voadas e consumo automaticamente', () => {
    expect(calcHorasVoadas('2026-06-14T10:00', '2026-06-14T12:30')).toBe(2.5);
    expect(calcConsumoCombustivel(1000, 700)).toBe(300);
  });

  it('agrega trechos no patch do RDV', () => {
    const seed = seedTrechosFromVoo(
      {
        data_programacao: '2026-06-14',
        horario_previsto_partida: '2026-06-14T10:00:00Z',
        horario_previsto_chegada: '2026-06-14T12:00:00Z',
      },
      'SBSP',
      'SBRJ',
      null,
    );
    const second = duplicateTrecho(seed[0]);
    second.destino = 'SBGL';
    second.horario_pouso = '2026-06-14T14:00';
    second.combustivel_pouso = '500';
    second.numero_pousos = '1';

    const patch = aggregateTrechosToFormPatch([...seed, second]);
    expect(patch.horario_decolagem_real).toBe(seed[0].horario_decolagem);
    expect(patch.horario_pouso_real).toBe(second.horario_pouso);
    expect(patch.combustivel_pouso).toBe('500');
  });

  it('navega etapas em ordem e calcula progresso', () => {
    expect(getStepIndex('identificacao')).toBe(0);
    expect(getStepIndex('revisao')).toBe(RDV_PILOT_STEPS.length - 1);

    const form = baseForm();
    expect(
      isStepComplete('tripulacao', form, {
        tripulantesCount: 0,
        abastecimentosCount: 0,
        trechosCount: 1,
      }),
    ).toBe(false);

    const pct = computeProgressPercent(form, {
      tripulantesCount: 1,
      abastecimentosCount: 0,
      trechosCount: 1,
    });
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('detecta conflito de versão', () => {
    expect(isVersionConflictError(new Error('CONTROLE_VOOS_RDV_VERSION_CONFLICT'))).toBe(true);
    expect(isVersionConflictError(new Error('Versao do RDV desatualizada. Recarregue'))).toBe(true);
    expect(isVersionConflictError(new Error('outro erro'))).toBe(false);
  });

  it('resume trechos do sessionStorage', () => {
    const drafted = seedTrechosFromVoo(
      {
        data_programacao: '2026-06-14',
        horario_previsto_partida: '2026-06-14T10:00:00Z',
        horario_previsto_chegada: '2026-06-14T12:00:00Z',
      },
      'SBSP',
      'SBRJ',
      null,
    );
    drafted[0].origem = 'SBCF';
    saveTrechoDraft(601, drafted);
    expect(loadTrechoDraft(601)?.[0].origem).toBe('SBCF');
  });

  it('buildFormState retoma campos do RDV existente', () => {
    const form = buildFormState(
      { prefixo: 'ATX-1001', data_programacao: '2026-06-14' },
      {
        id: 1,
        empresa_id: 1,
        voo_id: 601,
        numero: 'RDV-20260614-ATX1001',
        data_voo: '2026-06-14',
        horario_decolagem_real: '2026-06-14T13:00:00.000Z',
        horario_pouso_real: '2026-06-14T15:00:00.000Z',
        horas_voadas: 2,
        numero_pousos: 1,
        ciclos: 1,
        combustivel_decolagem: 900,
        combustivel_pouso: 600,
        combustivel_consumo: 300,
        pob: 3,
        carga_kg: 50,
        ocorrencias: 'Turbulência',
        divergencias: null,
        status: 'rascunho',
        responsavel_preenchimento_id: 1,
        preenchido_em: null,
        finalizado_operacionalmente_por: null,
        finalizado_operacionalmente_em: null,
        workflow_status: 'rascunho',
        versao: 1,
        enviado_por: null,
        enviado_em: null,
        revisao_iniciada_por: null,
        revisao_iniciada_em: null,
        aprovado_coordenacao_por: null,
        aprovado_coordenacao_em: null,
        finalizado_workflow_em: null,
        reaberto_por: null,
        reaberto_em: null,
        motivo_devolucao: null,
        motivo_cancelamento: null,
        created_at: '2026-06-14T10:00:00Z',
        updated_at: '2026-06-14T10:00:00Z',
      },
    );
    expect(form.ocorrencias).toBe('Turbulência');
    expect(form.combustivel_consumo).toBe('300');
  });
});

describe('useRdvAutosave', () => {
  it('marca pendente e salva com debounce', async () => {
    vi.useFakeTimers();
    const saveFn = vi.fn().mockResolvedValue({ id: 1 });
    const form = baseForm();

    const { result, rerender } = renderHook(
      ({ f }) =>
        useRdvAutosave({
          vooId: 601,
          form: f,
          enabled: true,
          debounceMs: 500,
          saveFn,
        }),
      { initialProps: { f: form }, wrapper },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('idle');
    expect(saveFn).not.toHaveBeenCalled();

    const dirty = { ...form, pob: '5' };
    rerender({ f: dirty });

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe('pendente');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(saveFn).toHaveBeenCalled();
    expect(result.current.status).toBe('salvo');
    expect(saveFn.mock.calls[0][0].dados.pob).toBe(5);
  });

  it('expõe erro de salvamento e conflito de versão', async () => {
    const saveFn = vi
      .fn()
      .mockRejectedValue(
        new Error('Versao do RDV desatualizada. Recarregue os dados antes de continuar.'),
      );
    const form = baseForm();
    const { result } = renderHook(
      () =>
        useRdvAutosave({
          vooId: 601,
          form,
          enabled: true,
          debounceMs: 10,
          saveFn,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.status).toBe('erro');
    expect(result.current.error).toMatch(/desatualizada/i);
    expect(isVersionConflictError(new Error(result.current.error || ''))).toBe(true);
  });
});

describe('useUnsavedChangesGuard', () => {
  it('registra beforeunload quando há alterações pendentes', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useUnsavedChangesGuard(true), { wrapper });
    expect(addSpy.mock.calls.some((call) => call[0] === 'beforeunload')).toBe(true);
    addSpy.mockRestore();
  });

  it('confirmLeave bloqueia navegação quando o usuário cancela', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useUnsavedChangesGuard(true), { wrapper });
    expect(result.current.confirmLeave('/controle-voos')).toBe(false);
    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe('ControleVoosRdvStepper', () => {
  it('mostra progresso e permite navegar entre etapas', () => {
    const onStepChange = vi.fn();
    const completed = new Set<RdvPilotStepId>(['identificacao']);

    render(
      <ControleVoosRdvStepper
        currentStep="trechos"
        completedSteps={completed}
        onStepChange={onStepChange}
        progressPercent={40}
      />,
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('40%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tripulação/i }));
    expect(onStepChange).toHaveBeenCalledWith('tripulacao');
  });
});

describe('ControleVoosRdvSaveStatus + TrechoCard', () => {
  it('renderiza status de salvamento', () => {
    const { unmount } = render(<ControleVoosRdvSaveStatus status="pendente" />);
    expect(screen.getByTestId('rdv-save-status')).toHaveTextContent('Alterações pendentes');
    unmount();

    render(<ControleVoosRdvSaveStatus status="erro" error="Falha de rede" />);
    expect(screen.getByText('Erro de salvamento')).toBeInTheDocument();
    expect(screen.getByText('Falha de rede')).toBeInTheDocument();
  });

  it('renderiza card de trecho com cálculos e ações', () => {
    const onDuplicate = vi.fn();
    const trecho = seedTrechosFromVoo(
      {
        data_programacao: '2026-06-14',
        horario_previsto_partida: '2026-06-14T10:00:00Z',
        horario_previsto_chegada: '2026-06-14T12:00:00Z',
      },
      'SBSP',
      'SBRJ',
      null,
    )[0];
    trecho.id = 42;
    trecho.combustivel_decolagem = '800';
    trecho.combustivel_pouso = '500';

    render(
      <ControleVoosRdvTrechoCard
        index={0}
        trecho={trecho}
        onChange={vi.fn()}
        onDuplicate={onDuplicate}
        onRemove={vi.fn()}
        canRemove
      />,
    );

    expect(screen.getByTestId('rdv-trecho-card-0')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Duplicar/i }));
    expect(onDuplicate).toHaveBeenCalled();
  });
});

describe('etapas persistidas — mapeamento e recuperação local', () => {
  afterEach(() => {
    clearEtapaPendingRecovery(601);
    sessionStorage.clear();
  });

  it('mapeia etapa da API para draft e de volta sem perder ICAO/combustível', () => {
    const draft = draftFromEtapa({
      id: 11,
      origem_icao: 'SBRJ',
      destino_icao: 'SBSP',
      horario_decolagem: '2026-06-14T10:00:00Z',
      horario_pouso: '2026-06-14T11:00:00Z',
      combustivel_inicio: 900,
      combustivel_fim: 700,
      pousos_diurnos: 1,
      pousos_noturnos: 0,
      pax: 4,
      payload: 120,
    });
    expect(draft.id).toBe(11);
    expect(draft.origem).toBe('SBRJ');
    expect(draft.combustivel_decolagem).toBe('900');
    const patch = draftToEtapaPatch(draft);
    expect(patch.origem_icao).toBe('SBRJ');
    expect(patch.combustivel_inicio).toBe(900);
    expect(patch.pax).toBe(4);
  });

  it('recupera patches pendentes da mesma versao e descarta recuperação mais antiga que o servidor', () => {
    saveEtapaPendingRecovery(601, {
      vooId: '601',
      versao: 3,
      timestamp: '2026-06-14T12:00:00Z',
      patches: [{ id: 11, fields: { origem_icao: 'SBGR' } }],
    });
    expect(loadEtapaPendingRecovery(601)?.versao).toBe(3);
    expect(loadEtapaPendingRecovery(601)?.patches[0].fields.origem_icao).toBe('SBGR');

    // Simula servidor mais novo: caller limpa recovery quando pending.versao < server
    const pending = loadEtapaPendingRecovery(601)!;
    const serverVersao = 4;
    if (pending.versao < serverVersao) {
      clearEtapaPendingRecovery(601);
    }
    expect(loadEtapaPendingRecovery(601)).toBeNull();
  });

  it('não usa aggregateTrechosToFormPatch como fonte canônica quando há ids persistidos', () => {
    const a = draftFromEtapa({
      id: 1,
      origem_icao: 'SBRJ',
      destino_icao: 'SBSP',
      horario_decolagem: '2026-06-14T10:00:00Z',
      horario_pouso: '2026-06-14T10:40:00Z',
      combustivel_inicio: 1000,
      combustivel_fim: 800,
      pousos_diurnos: 1,
      pousos_noturnos: 0,
      pax: 2,
      payload: null,
    });
    const b = draftFromEtapa({
      id: 2,
      origem_icao: 'SBSP',
      destino_icao: 'SBRJ',
      horario_decolagem: '2026-06-14T11:00:00Z',
      horario_pouso: '2026-06-14T11:30:00Z',
      combustivel_inicio: 800,
      combustivel_fim: 650,
      pousos_diurnos: 1,
      pousos_noturnos: 0,
      pax: 3,
      payload: null,
    });
    expect([a, b].every((t) => typeof t.id === 'number')).toBe(true);
    // Agregado ainda existe só como helper legado de compatibilidade visual.
    const legacy = aggregateTrechosToFormPatch([a, b]);
    expect(legacy.numero_pousos).toBe('2');
    expect(legacy.combustivel_decolagem).toBe('1000');
    expect(legacy.combustivel_pouso).toBe('650');
  });
});

describe('ControleVoosCoordenacaoFila status filters', () => {
  it('inclui filtros devolvido e reaberto na lista de opções', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      success: true,
      data: { success: true, data: [] },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ControleVoosCoordenacaoFila />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const select = await screen.findByTestId('coordenacao-status-filter');
    const values = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(values).toEqual(
      expect.arrayContaining([
        'devolvido',
        'reaberto',
        'enviado',
        'em_revisao',
        'aprovado_coordenacao',
        'finalizado',
        'cancelado',
      ]),
    );
  });
});
