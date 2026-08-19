/**
 * fetchWithAuth() — persisted refresh sobrevive a cold start.
 *
 * Bug root-cause: fetchWithAuth() decide se tenta refresh checando a
 * variável em memória `cachedRefreshToken` diretamente, não
 * getRefreshToken() (que também lê do storage). Em cold start (reload de
 * página), as variáveis de módulo `cachedToken`/`cachedRefreshToken`
 * reiniciam para null — mesmo que exista uma sessão persistida válida em
 * localStorage/sessionStorage. Resultado: a primeira chamada autenticada
 * após reload nunca tenta o refresh persistido e desloga o usuário
 * indevidamente.
 *
 * Estes testes usam vi.resetModules() + import fresco do módulo para
 * simular fielmente um cold start real (module-level state reiniciado),
 * seguindo o mesmo padrão de api.auth-session.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@/react-app/lib/apiFetch', () => ({
  apiFetch: apiFetchMock,
}));

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    get length() {
      return store.size;
    },
  };
}

function makeJwt(expirationSecondsFromNow: number): string {
  const payload = {
    exp: Math.floor(Date.now() / 1000) + expirationSecondsFromNow,
    sub: '1',
    empresa_id: 10,
  };
  return [
    btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    btoa(JSON.stringify(payload)),
    'signature',
  ].join('.');
}

function refreshResponse(accessToken: string, refreshToken: string) {
  return new Response(
    JSON.stringify({ data: { accessToken, refreshToken } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

beforeEach(() => {
  vi.resetModules();
  apiFetchMock.mockReset();

  Object.defineProperty(globalThis, 'localStorage', {
    value: createStorage(),
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: createStorage(),
    configurable: true,
  });
});

describe('fetchWithAuth — cold start com sessão persistida', () => {
  it('access token expirado em storage + refresh token válido em storage: reconstrói a sessão via refresh, sem deslogar', async () => {
    // Simula uma sessão "PERSIST TRUE" de uma aba/sessão anterior: os
    // tokens já estão em localStorage antes deste módulo ser importado —
    // exatamente como estariam após um reload de página real.
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(-3600)); // expirado
    localStorage.setItem('airtrust_refresh_token', 'refresh-persistido-valido');

    const module = await import('../api');

    apiFetchMock
      .mockResolvedValueOnce(refreshResponse(makeJwt(3600), 'refresh-rotacionado'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const response = await module.fetchWithAuth('/api/qualificacoes');

    expect(response.status).toBe(200);
    // O refresh persistido foi de fato usado — não uma sessão nova/vazia.
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      1,
      module.API_ENDPOINTS.REFRESH_TOKEN,
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: 'refresh-persistido-valido' }),
      }),
    );
    // A requisição original foi repetida exatamente uma vez com o novo token.
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(module.getAccessToken()).not.toBeNull();
  });

  it('access token ausente da memória mas presente em storage: primeira chamada pós cold-start não desloga o usuário', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(-10)); // expirado por poucos segundos
    localStorage.setItem('airtrust_refresh_token', 'refresh-cold-start');

    const module = await import('../api');

    apiFetchMock
      .mockResolvedValueOnce(refreshResponse(makeJwt(3600), 'refresh-novo'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await expect(module.fetchWithAuth('/api/qualificacoes')).resolves.toMatchObject({
      status: 200,
    });
  });

  it('persist=false: sessão de sessionStorage de uma aba anterior não é restaurada por um novo cold start de outra aba', async () => {
    // sessionStorage é por-aba — simula o caso real: a sessão anterior
    // nunca chega a existir para uma NOVA aba/cold start quando
    // persist=false, então não há refresh token algum para tentar.
    localStorage.setItem('airtrust_persist_login', '0');

    const module = await import('../api');

    await expect(module.fetchWithAuth('/api/qualificacoes')).rejects.toThrow(
      'Authentication required',
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('refresh token inválido (backend rejeita 401/INVALID_REFRESH_TOKEN): fail closed, sessão limpa', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(-3600));
    localStorage.setItem('airtrust_refresh_token', 'refresh-invalido');

    const module = await import('../api');

    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Inválido', code: 'INVALID_REFRESH_TOKEN' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(module.fetchWithAuth('/api/qualificacoes')).rejects.toMatchObject({
      name: 'AuthRefreshError',
      terminal: true,
    });
    expect(module.getAccessToken()).toBeNull();
    expect(module.getRefreshToken()).toBeNull();
  });

  it('refresh token expirado: fail closed, sessão limpa', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(-3600));
    localStorage.setItem('airtrust_refresh_token', 'refresh-expirado');

    const module = await import('../api');

    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Expirado', code: 'REFRESH_TOKEN_EXPIRED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(module.fetchWithAuth('/api/qualificacoes')).rejects.toMatchObject({
      name: 'AuthRefreshError',
      terminal: true,
    });
    expect(module.getAccessToken()).toBeNull();
  });

  it('storage corrompido (JSON/JWT malformado): fail closed, não trava nem loga in inválido', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', 'not-a-valid-jwt');
    localStorage.setItem('airtrust_refresh_token', '');

    const module = await import('../api');

    await expect(module.fetchWithAuth('/api/qualificacoes')).rejects.toThrow(
      'Authentication required',
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('N requisições concorrentes após cold start disparam apenas UM refresh; as demais aguardam e prosseguem depois', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(-3600));
    localStorage.setItem('airtrust_refresh_token', 'refresh-concorrente');

    const module = await import('../api');

    let resolveRefresh!: (response: Response) => void;
    apiFetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    apiFetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const requests = [
      module.fetchWithAuth('/api/a'),
      module.fetchWithAuth('/api/b'),
      module.fetchWithAuth('/api/c'),
    ];

    // Apenas a chamada de refresh foi disparada até aqui — nenhuma das 3
    // requisições originais prosseguiu ainda.
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    resolveRefresh(refreshResponse(makeJwt(3600), 'refresh-pos-concorrencia'));
    await Promise.all(requests);

    // 1 refresh + 3 requisições originais retried = 4 chamadas totais,
    // nunca 3 refreshes separados.
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });

  it('anti-loop: 401 persistente mesmo após refresh bem-sucedido não tenta um segundo refresh — propaga o 401', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(3600));
    localStorage.setItem('airtrust_refresh_token', 'refresh-anti-loop');

    const module = await import('../api');

    // Sequência real do cenário 401→refresh→retry→401: a requisição
    // original recebe 401, o refresh É tentado (retry=false ainda) e tem
    // sucesso, a requisição é repetida com o novo token — mas o backend
    // devolve 401 de novo (ex.: permissão realmente negada, não apenas
    // token velho). Nessa segunda chamada retry já é true, então NENHUM
    // segundo refresh deve ser tentado — o 401 é devolvido ao chamador.
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }))
      .mockResolvedValueOnce(refreshResponse(makeJwt(3600), 'refresh-pos-anti-loop'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }));

    const response = await module.fetchWithAuth('/api/qualificacoes');

    // 3 chamadas: 401 original, refresh, retry (que também deu 401) — e
    // parou aí. Nenhuma quarta chamada (um segundo refresh) foi feita.
    expect(response.status).toBe(401);
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it('tenant (empresa_id) do token restaurado via cold-start refresh é preservado, nunca reconstruído de parâmetro', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(-3600));
    localStorage.setItem('airtrust_refresh_token', 'refresh-tenant');

    const module = await import('../api');
    const newAccessToken = makeJwt(3600); // empresa_id: 10, embutido no JWT

    apiFetchMock
      .mockResolvedValueOnce(refreshResponse(newAccessToken, 'refresh-tenant-novo'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await module.fetchWithAuth('/api/qualificacoes');

    // O tenant vem inteiramente do JWT assinado pelo backend na resposta
    // de refresh — nunca de um parâmetro de request client-controlado.
    const restoredToken = module.getAccessToken();
    expect(restoredToken).toBe(newAccessToken);
    const payload = JSON.parse(atob(restoredToken!.split('.')[1]));
    expect(payload.empresa_id).toBe(10);
  });

  it('logout limpa a persistência: cold start seguinte não encontra sessão para restaurar', async () => {
    localStorage.setItem('airtrust_persist_login', '1');
    localStorage.setItem('airtrust_token', makeJwt(3600));
    localStorage.setItem('airtrust_refresh_token', 'refresh-para-logout');

    const module = await import('../api');
    apiFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    await module.logout();

    expect(localStorage.getItem('airtrust_token')).toBeNull();
    expect(localStorage.getItem('airtrust_refresh_token')).toBeNull();

    // "Cold start seguinte": novo import do módulo, storage já limpo.
    vi.resetModules();
    apiFetchMock.mockReset();
    const freshModule = await import('../api');
    await expect(freshModule.fetchWithAuth('/api/qualificacoes')).rejects.toThrow(
      'Authentication required',
    );
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('fluxo normal (token válido em memória, sem cold start) continua funcionando sem regressão', async () => {
    const module = await import('../api');
    module.setPersistLogin(true);
    module.setTokens(makeJwt(3600), 'refresh-fluxo-normal');

    apiFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));

    const response = await module.fetchWithAuth('/api/qualificacoes');
    expect(response.status).toBe(200);
    expect(apiFetchMock).toHaveBeenCalledTimes(1); // sem refresh algum necessário
  });
});
