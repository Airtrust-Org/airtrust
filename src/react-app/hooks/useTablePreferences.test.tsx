import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTablePreferences } from './useTablePreferences';

const { fetchWithAuthMock, authState } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  authState: {
    empresaAtualId: 1 as number | null,
    user: { id: 10 } as { id: number } | null,
  },
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

type Preferences = {
  searchTerm: string;
  categoriaFilter: string;
  setorFilter: number[];
};

const TABLE_KEY = 'table.qualificacoes.modelos';
const DEFAULT_PREFERENCES: Preferences = {
  searchTerm: '',
  categoriaFilter: '',
  setorFilter: [],
};

function response(data: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => data,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function storageKey(empresaId = 1, userId = 10, tableKey = TABLE_KEY): string {
  return `@airtrust/table-preferences/${empresaId}/${userId}/${tableKey}`;
}

function requestMethods(): string[] {
  return fetchWithAuthMock.mock.calls.map(([, options]) => {
    return ((options as RequestInit | undefined)?.method || 'GET').toUpperCase();
  });
}

function putCalls(): unknown[][] {
  return fetchWithAuthMock.mock.calls.filter(([, options]) => {
    return (options as RequestInit | undefined)?.method === 'PUT';
  });
}

function Harness({
  tick,
  tableKey = TABLE_KEY,
  defaultValue = DEFAULT_PREFERENCES,
}: {
  tick: number;
  tableKey?: string;
  defaultValue?: Preferences;
}) {
  const { preferences, setPreferences, ready, resetPreferences } = useTablePreferences<Preferences>(
    tableKey,
    defaultValue,
  );

  return (
    <div>
      <span>{ready ? 'ready' : 'loading'}</span>
      <span data-testid="search-term">{preferences.searchTerm}</span>
      <span data-testid="tick">{tick}</span>
      <button
        type="button"
        onClick={() =>
          setPreferences((current) => ({
            ...current,
            searchTerm: 'alterado pelo usuário',
          }))
        }
      >
        alterar
      </button>
      <button
        type="button"
        onClick={() =>
          setPreferences((current) => ({
            ...current,
            searchTerm: 'segunda alteração',
          }))
        }
      >
        alterar novamente
      </button>
      <button type="button" onClick={resetPreferences}>
        resetar
      </button>
    </div>
  );
}

describe('useTablePreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchWithAuthMock.mockReset();
    authState.empresaAtualId = 1;
    authState.user = { id: 10 };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('nao recarrega preferencias quando defaultValue muda de referencia com o mesmo conteudo', async () => {
    fetchWithAuthMock.mockResolvedValue(response({ data: null }));

    const { rerender } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    rerender(<Harness tick={2} defaultValue={{ ...DEFAULT_PREFERENCES }} />);

    await waitFor(() => {
      expect(screen.getByTestId('tick')).toHaveTextContent('2');
    });

    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
  });

  it('hidrata do backend sem executar PUT redundante', async () => {
    fetchWithAuthMock.mockResolvedValue(
      response({
        data: {
          searchTerm: 'preferência remota',
          categoriaFilter: 'CRM',
          setorFilter: [7],
        },
      }),
    );

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('preferência remota');
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(requestMethods()).toEqual(['GET']);
  });

  it('preserva o debounce de exatamente 300 ms para alteracoes do usuario', async () => {
    fetchWithAuthMock.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve(response({ success: true }));
      }
      return Promise.resolve(response({ data: null }));
    });

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(putCalls()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(putCalls()).toHaveLength(1);

    const putOptions = putCalls()[0]?.[1] as RequestInit;
    expect(JSON.parse(String(putOptions.body))).toMatchObject({
      valor: { searchTerm: 'alterado pelo usuário' },
    });
  });

  it('cancela o timer pendente e nao salva no tenant anterior ao trocar de empresa', async () => {
    let getCount = 0;
    fetchWithAuthMock.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve(response({ success: true }));
      }

      getCount += 1;
      return Promise.resolve(
        response({
          data: {
            searchTerm: getCount === 1 ? 'empresa 1' : 'empresa 2',
            categoriaFilter: '',
            setorFilter: [],
          },
        }),
      );
    });

    const { rerender } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));
    authState.empresaAtualId = 2;
    rerender(<Harness tick={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 2');
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(requestMethods()).toEqual(['GET', 'GET']);
    expect(localStorage.getItem(storageKey(1, 10))).not.toContain('alterado pelo usuário');
    expect(localStorage.getItem(storageKey(2, 10))).toContain('empresa 2');
  });

  it('usa fallback local valido durante a carga e o preserva quando o GET falha', async () => {
    const pendingGet = deferred<Response>();
    localStorage.setItem(
      storageKey(),
      JSON.stringify({ searchTerm: 'fallback local', categoriaFilter: 'CRM', setorFilter: [3] }),
    );
    fetchWithAuthMock.mockReturnValue(pendingGet.promise);

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('fallback local');
      expect(screen.getByText('loading')).toBeInTheDocument();
    });

    await act(async () => {
      pendingGet.resolve(response({}, { ok: false, status: 503 }));
      await pendingGet.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
      expect(screen.getByTestId('search-term')).toHaveTextContent('fallback local');
    });

    expect(requestMethods()).toEqual(['GET']);
  });

  it('ignora fallback local corrompido sem bloquear o estado ready', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(storageKey(), '{json-invalido');
    fetchWithAuthMock.mockResolvedValue(response({}, { ok: false, status: 500 }));

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
      expect(screen.getByTestId('search-term')).toHaveTextContent('');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[useTablePreferences] erro ao carregar fallback local:',
      expect.any(SyntaxError),
    );
    expect(requestMethods()).toEqual(['GET']);
  });

  it('faz a preferencia remota prevalecer sobre o fallback local sem criar PUT', async () => {
    const pendingGet = deferred<Response>();
    localStorage.setItem(
      storageKey(),
      JSON.stringify({ searchTerm: 'fallback local', categoriaFilter: '', setorFilter: [] }),
    );
    fetchWithAuthMock.mockReturnValue(pendingGet.promise);

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('fallback local');
    });

    await act(async () => {
      pendingGet.resolve(
        response({
          data: { searchTerm: 'preferência remota', categoriaFilter: '', setorFilter: [] },
        }),
      );
      await pendingGet.promise;
    });

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
      expect(screen.getByTestId('search-term')).toHaveTextContent('preferência remota');
    });

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(requestMethods()).toEqual(['GET']);
    expect(localStorage.getItem(storageKey())).toContain('preferência remota');
  });

  it('aborta e neutraliza GET obsoleto durante troca rapida de empresa e usuario', async () => {
    const firstGet = deferred<Response>();
    let getCount = 0;

    fetchWithAuthMock.mockImplementation(() => {
      getCount += 1;
      if (getCount === 1) return firstGet.promise;
      return Promise.resolve(
        response({
          data: { searchTerm: 'empresa 2 usuário 20', categoriaFilter: '', setorFilter: [] },
        }),
      );
    });

    const { rerender } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    });

    const firstSignal = (fetchWithAuthMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;

    authState.empresaAtualId = 2;
    authState.user = { id: 20 };
    rerender(<Harness tick={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 2 usuário 20');
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    expect(firstSignal.aborted).toBe(true);

    await act(async () => {
      firstGet.resolve(
        response({
          data: { searchTerm: 'resposta antiga', categoriaFilter: '', setorFilter: [] },
        }),
      );
      await firstGet.promise;
    });

    expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 2 usuário 20');
    expect(localStorage.getItem(storageKey(2, 20))).toContain('empresa 2 usuário 20');
    expect(localStorage.getItem(storageKey(1, 10))).not.toContain('resposta antiga');
    expect(putCalls()).toHaveLength(0);
  });

  it('aborta e neutraliza PUT em voo ao trocar de tenant', async () => {
    const pendingPut = deferred<Response>();
    let getCount = 0;

    fetchWithAuthMock.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') return pendingPut.promise;

      getCount += 1;
      return Promise.resolve(
        response({
          data: {
            searchTerm: getCount === 1 ? 'empresa 1' : 'empresa 2',
            categoriaFilter: '',
            setorFilter: [],
          },
        }),
      );
    });

    const { rerender } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));

    await waitFor(
      () => {
        expect(putCalls()).toHaveLength(1);
      },
      { timeout: 1000 },
    );

    const stalePutSignal = (putCalls()[0]?.[1] as RequestInit).signal as AbortSignal;

    authState.empresaAtualId = 2;
    authState.user = { id: 20 };
    rerender(<Harness tick={2} />);

    await waitFor(() => {
      expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 2');
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    expect(stalePutSignal.aborted).toBe(true);

    await act(async () => {
      pendingPut.resolve(response({ success: true }));
      await pendingPut.promise;
    });

    await new Promise((resolve) => window.setTimeout(resolve, 350));

    expect(screen.getByTestId('search-term')).toHaveTextContent('empresa 2');
    expect(putCalls()).toHaveLength(1);
    expect(localStorage.getItem(storageKey(2, 20))).toContain('empresa 2');
  });

  it('neutraliza a conclusao de um PUT substituido no mesmo contexto', async () => {
    const firstPut = deferred<Response>();
    let putCount = 0;

    fetchWithAuthMock.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method !== 'PUT') {
        return Promise.resolve(response({ data: null }));
      }

      putCount += 1;
      return putCount === 1 ? firstPut.promise : Promise.resolve(response({ success: true }));
    });

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));

    await waitFor(
      () => {
        expect(putCalls()).toHaveLength(1);
      },
      { timeout: 1000 },
    );

    const stalePutSignal = (putCalls()[0]?.[1] as RequestInit).signal as AbortSignal;
    fireEvent.click(screen.getByRole('button', { name: 'alterar novamente' }));

    await waitFor(
      () => {
        expect(putCalls()).toHaveLength(2);
      },
      { timeout: 1000 },
    );
    expect(stalePutSignal.aborted).toBe(true);

    await act(async () => {
      firstPut.resolve(response({ success: true }));
      await firstPut.promise;
    });

    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));

    await waitFor(
      () => {
        expect(putCalls()).toHaveLength(3);
      },
      { timeout: 1000 },
    );

    const lastPutOptions = putCalls()[2]?.[1] as RequestInit;
    expect(JSON.parse(String(lastPutOptions.body))).toMatchObject({
      valor: { searchTerm: 'alterado pelo usuário' },
    });
  });

  it('mantem o fallback local e registra falha HTTP no PUT', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchWithAuthMock.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve(response({}, { ok: false, status: 500 }));
      }
      return Promise.resolve(response({ data: null }));
    });

    render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));

    await waitFor(
      () => {
        expect(putCalls()).toHaveLength(1);
      },
      { timeout: 1000 },
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useTablePreferences] erro ao salvar backend:',
        expect.any(Error),
      );
    });

    expect(localStorage.getItem(storageKey())).toContain('alterado pelo usuário');
  });

  it('cancela o timer de persistencia ao desmontar o componente', async () => {
    fetchWithAuthMock.mockImplementation((_url: string, options?: RequestInit) => {
      if (options?.method === 'PUT') {
        return Promise.resolve(response({ success: true }));
      }
      return Promise.resolve(response({ data: null }));
    });

    const { unmount } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'alterar' }));
    unmount();

    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(putCalls()).toHaveLength(0);
  });

  it('aborta a hidratacao pendente ao desmontar o componente', async () => {
    const pendingGet = deferred<Response>();
    fetchWithAuthMock.mockReturnValue(pendingGet.promise);

    const { unmount } = render(<Harness tick={1} />);

    await waitFor(() => {
      expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);
    });

    const signal = (fetchWithAuthMock.mock.calls[0]?.[1] as RequestInit).signal as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);

    await act(async () => {
      pendingGet.resolve(response({ data: null }));
      await pendingGet.promise;
    });
  });
});
