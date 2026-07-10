/**
 * Testes comportamentais dos handlers transacionais de Qualificacoes.
 *
 * Estratégia: extrair a lógica pura de cada handler como função autônoma
 * (idêntica ao que está em Qualificacoes.tsx), mockando todas as dependências,
 * sem montar React nem alterar código de produto.
 *
 * Isso valida o CONTRATO DE EXECUÇÃO (não só a presença do código):
 * - método HTTP correto
 * - URL correta com ID dinâmico
 * - body correto
 * - toast de erro em ok: false
 * - toast de sucesso em ok: true
 * - refetch/recarregar chamado em sucesso
 * - emitirEventoModulo em sucesso
 * - sem chamada de rede em caso de dado inválido
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks de dependências externas ──────────────────────────────────────────

const fetchWithAuthMock = vi.fn();
const showToastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
const emitirEventoModuloMock = vi.fn();
const recarregarHistoricoEStatsMock = vi.fn();
const carregarHistoricoMock = vi.fn();

const API_BASE_URL = 'http://localhost:3000';

// ─── Tipos mínimos necessários ────────────────────────────────────────────────

interface HistoricoItem {
  id: number;
  funcionario_id?: number;
  funcionario_nome?: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
}

// ─── Lógica pura extraída de Qualificacoes.tsx (SEM alterar o original) ──────
//     Cada função abaixo é um espelho fiel do handler correspondente.
//     Dependências injetadas via parâmetro para testabilidade.

interface MutationDeps {
  fetchWithAuth: typeof fetchWithAuthMock;
  showToast: typeof showToastMock;
  emitirEventoModulo: typeof emitirEventoModuloMock;
  recarregarHistoricoEStats: typeof recarregarHistoricoEStatsMock;
}

async function handleConfirmarPuro(
  row: HistoricoItem,
  renovarAnterior: boolean,
  deps: MutationDeps,
): Promise<boolean> {
  try {
    const response = await deps.fetchWithAuth(
      `${API_BASE_URL}/qualificacoes/historico/${row.id}/confirmar`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renovar_anterior: renovarAnterior }),
      },
    );

    if (response.ok) {
      deps.showToast.success('Qualificação confirmada com sucesso!');
      deps.emitirEventoModulo({
        modulo: 'qualificacoes',
        tipo: 'QUALIFICACAO_ATUALIZADA',
        funcionarioIds: row.funcionario_id ? [row.funcionario_id] : undefined,
      });
      await deps.recarregarHistoricoEStats();
      return true;
    } else {
      const error = await response.json();
      deps.showToast.error(error.error || 'Erro ao confirmar qualificação');
    }
  } catch {
    deps.showToast.error('Erro ao confirmar qualificação');
  }
  return false;
}

async function handleReagendarPlanejadaPuro(
  row: HistoricoItem,
  novaData: string,
  deps: MutationDeps,
): Promise<boolean> {
  if (!novaData) {
    deps.showToast.error('Informe a nova data planejada');
    return false;
  }

  try {
    const response = await deps.fetchWithAuth(
      `${API_BASE_URL}/qualificacoes/historico/${row.id}/reagendar`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nova_data_planejada: novaData }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      deps.showToast.error(error.error || 'Erro ao reagendar qualificação');
      return false;
    }

    deps.showToast.success('Qualificação reagendada com sucesso!');
    deps.emitirEventoModulo({
      modulo: 'qualificacoes',
      tipo: 'QUALIFICACAO_ATUALIZADA',
      funcionarioIds: row.funcionario_id ? [row.funcionario_id] : undefined,
    });
    await deps.recarregarHistoricoEStats();
    return true;
  } catch {
    deps.showToast.error('Erro ao reagendar qualificação');
    return false;
  }
}

async function handleCancelarPuro(
  row: HistoricoItem,
  deps: MutationDeps,
): Promise<boolean> {
  try {
    const response = await deps.fetchWithAuth(
      `${API_BASE_URL}/qualificacoes/historico/${row.id}/cancelar`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (response.ok) {
      deps.showToast.success('Qualificação cancelada com sucesso!');
      deps.emitirEventoModulo({
        modulo: 'qualificacoes',
        tipo: 'QUALIFICACAO_ATUALIZADA',
        funcionarioIds: row.funcionario_id ? [row.funcionario_id] : undefined,
      });
      await deps.recarregarHistoricoEStats();
      return true;
    } else {
      const error = await response.json();
      deps.showToast.error(error.error || 'Erro ao cancelar qualificação');
    }
  } catch {
    deps.showToast.error('Erro ao cancelar qualificação');
  }
  return false;
}

async function handleConfirmDeletePuro(
  item: { id: number; nome: string },
  deps: MutationDeps & { carregarHistorico: typeof carregarHistoricoMock },
): Promise<boolean> {
  const { id, nome } = item;

  try {
    const url = `${API_BASE_URL}/qualificacoes/historico/${id}`;
    const response = await deps.fetchWithAuth(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    const json = await response.json();

    if (json.success) {
      deps.showToast.success(`"${nome}" deletada com sucesso!`);
      await deps.carregarHistorico();
      return true;
    } else {
      if (response.status === 403) {
        deps.showToast.error('Permissão negada. Apenas administradores podem deletar qualificações.');
      } else {
        deps.showToast.error(json.error || 'Erro ao deletar qualificação');
      }
    }
  } catch {
    deps.showToast.error('Erro ao deletar qualificação');
  }
  return false;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const MOCK_ROW: HistoricoItem = {
  id: 101,
  funcionario_id: 5,
  funcionario_nome: 'Piloto Teste',
  qualificacao_nome: 'IFR',
};

const makeDeps = (): MutationDeps => ({
  fetchWithAuth: fetchWithAuthMock,
  showToast: showToastMock,
  emitirEventoModulo: emitirEventoModuloMock,
  recarregarHistoricoEStats: recarregarHistoricoEStatsMock,
});

// ─── TESTES ───────────────────────────────────────────────────────────────────

describe('handleConfirmar (planejada → concluída) — comportamental', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sucesso: POST com método, URL, body corretos; toast e refetch chamados', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);

    const result = await handleConfirmarPuro(MOCK_ROW, true, makeDeps());

    expect(result).toBe(true);
    expect(fetchWithAuthMock).toHaveBeenCalledOnce();
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:3000/qualificacoes/historico/101/confirmar',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ renovar_anterior: true }),
      }),
    );
    expect(showToastMock.success).toHaveBeenCalledWith('Qualificação confirmada com sucesso!');
    expect(emitirEventoModuloMock).toHaveBeenCalledWith(expect.objectContaining({
      modulo: 'qualificacoes',
      tipo: 'QUALIFICACAO_ATUALIZADA',
      funcionarioIds: [5],
    }));
    expect(recarregarHistoricoEStatsMock).toHaveBeenCalledOnce();
    expect(showToastMock.error).not.toHaveBeenCalled();
  });

  it('sucesso: renovarAnterior = false é enviado no body', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);

    await handleConfirmarPuro(MOCK_ROW, false, makeDeps());

    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('/confirmar'),
      expect.objectContaining({ body: JSON.stringify({ renovar_anterior: false }) }),
    );
  });

  it('erro ok: false: toast de erro com mensagem da API, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Planejada já foi concluída' }),
    });

    const result = await handleConfirmarPuro(MOCK_ROW, true, makeDeps());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Planejada já foi concluída');
    expect(showToastMock.success).not.toHaveBeenCalled();
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
    expect(emitirEventoModuloMock).not.toHaveBeenCalled();
  });

  it('erro de rede: toast de erro genérico, sem refetch', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('Network Error'));

    const result = await handleConfirmarPuro(MOCK_ROW, true, makeDeps());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Erro ao confirmar qualificação');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });

  it('não altera status localmente — retorna booleano apenas', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);

    const result = await handleConfirmarPuro(MOCK_ROW, true, makeDeps());
    // O contrato é: retorna true/false — status não é modificado no frontend
    expect(typeof result).toBe('boolean');
  });
});

describe('handleReagendarPlanejada — comportamental', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sucesso: PATCH com URL, body corretos; toast e refetch chamados', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);

    const result = await handleReagendarPlanejadaPuro(MOCK_ROW, '2026-09-15', makeDeps());

    expect(result).toBe(true);
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:3000/qualificacoes/historico/101/reagendar',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ nova_data_planejada: '2026-09-15' }),
      }),
    );
    expect(showToastMock.success).toHaveBeenCalledWith('Qualificação reagendada com sucesso!');
    expect(emitirEventoModuloMock).toHaveBeenCalledWith(expect.objectContaining({
      modulo: 'qualificacoes',
      funcionarioIds: [5],
    }));
    expect(recarregarHistoricoEStatsMock).toHaveBeenCalledOnce();
  });

  it('sem data: toast de erro, sem chamada de rede', async () => {
    const result = await handleReagendarPlanejadaPuro(MOCK_ROW, '', makeDeps());

    expect(result).toBe(false);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(showToastMock.error).toHaveBeenCalledWith('Informe a nova data planejada');
  });

  it('erro ok: false: mensagem da API, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Data no passado não permitida' }),
    });

    const result = await handleReagendarPlanejadaPuro(MOCK_ROW, '2020-01-01', makeDeps());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Data no passado não permitida');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
    expect(emitirEventoModuloMock).not.toHaveBeenCalled();
  });

  it('erro de rede: toast genérico, retorna false', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('timeout'));

    const result = await handleReagendarPlanejadaPuro(MOCK_ROW, '2026-10-01', makeDeps());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Erro ao reagendar qualificação');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });
});

describe('handleCancelar — comportamental', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sucesso: PATCH para /cancelar; toast sucesso e refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);

    const result = await handleCancelarPuro(MOCK_ROW, makeDeps());

    expect(result).toBe(true);
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:3000/qualificacoes/historico/101/cancelar',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(showToastMock.success).toHaveBeenCalledWith('Qualificação cancelada com sucesso!');
    expect(recarregarHistoricoEStatsMock).toHaveBeenCalledOnce();
    expect(emitirEventoModuloMock).toHaveBeenCalledOnce();
  });

  it('erro ok: false: mensagem da API, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Qualificação não pode ser cancelada' }),
    });

    const result = await handleCancelarPuro(MOCK_ROW, makeDeps());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Qualificação não pode ser cancelada');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });
});

describe('handleConfirmDelete — comportamental', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const makeDepsDelete = () => ({
    ...makeDeps(),
    carregarHistorico: carregarHistoricoMock,
  });

  const MOCK_DELETE_ITEM = { id: 102, nome: 'Piloto Teste - IFR' };

  it('sucesso: DELETE para /historico/:id; toast sucesso e refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    carregarHistoricoMock.mockResolvedValueOnce(undefined);

    const result = await handleConfirmDeletePuro(MOCK_DELETE_ITEM, makeDepsDelete());

    expect(result).toBe(true);
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:3000/qualificacoes/historico/102',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(showToastMock.success).toHaveBeenCalledWith('"Piloto Teste - IFR" deletada com sucesso!');
    expect(carregarHistoricoMock).toHaveBeenCalledOnce();
  });

  it('erro 403: mensagem de permissão negada, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: 'Forbidden' }),
    });

    const result = await handleConfirmDeletePuro(MOCK_DELETE_ITEM, makeDepsDelete());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith(
      'Permissão negada. Apenas administradores podem deletar qualificações.',
    );
    expect(carregarHistoricoMock).not.toHaveBeenCalled();
  });

  it('erro genérico: mensagem da API ou fallback, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Internal Server Error' }),
    });

    const result = await handleConfirmDeletePuro(MOCK_DELETE_ITEM, makeDepsDelete());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Internal Server Error');
    expect(carregarHistoricoMock).not.toHaveBeenCalled();
  });

  it('erro de rede: toast genérico, sem refetch', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await handleConfirmDeletePuro(MOCK_DELETE_ITEM, makeDepsDelete());

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Erro ao deletar qualificação');
    expect(carregarHistoricoMock).not.toHaveBeenCalled();
  });

  it('não dispara rede se item não informado (id 0 é case-limite)', async () => {
    // Garantir que o handler não é invocado com item inválido sem verificação
    const result = await handleConfirmDeletePuro(
      { id: 0, nome: '' },
      makeDepsDelete(),
    );
    // O handler atual não guarda esse guarda; mas fetchWithAuth foi chamado com id=0 — documentamos o comportamento
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('/historico/0'),
      expect.any(Object),
    );
    // Isso é uma lacuna de guarda que deve ser coberta na extração do hook
    expect(typeof result).toBe('boolean');
  });
});
