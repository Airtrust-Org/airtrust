/**
 * Testes comportamentais da implementação real de useQualificacoesMutations.
 *
 * Estratégia: chamar diretamente as funções retornadas pelo módulo real,
 * injetando dependências mockadas, sem duplicar handlers dentro do teste.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQualificacoesMutations } from '@/react-app/pages/qualificacoes/hooks/useQualificacoesMutations';

const fetchWithAuthMock = vi.fn();
const showToastMock = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
const emitirEventoModuloMock = vi.fn();
const recarregarHistoricoEStatsMock = vi.fn();

const API_BASE_URL = 'http://localhost:3000';

interface HistoricoItem {
  id: number;
  funcionario_id?: number;
  funcionario_nome?: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
}

const buildMutations = () =>
  useQualificacoesMutations({
    API_BASE_URL,
    fetchWithAuth: fetchWithAuthMock,
    showToast: showToastMock,
    emitirEventoModulo: emitirEventoModuloMock,
    recarregarHistoricoEStats: recarregarHistoricoEStatsMock,
  });

const MOCK_ROW: HistoricoItem = {
  id: 101,
  funcionario_id: 5,
  funcionario_nome: 'Piloto Teste',
  qualificacao_nome: 'IFR',
};

describe('handleConfirmar (planejada → concluída) — comportamental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sucesso: POST com método, URL, body corretos; toast e refetch chamados', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);
    const { handleConfirmar } = buildMutations();

    const result = await handleConfirmar(MOCK_ROW, true);

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
    expect(emitirEventoModuloMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modulo: 'qualificacoes',
        tipo: 'QUALIFICACAO_ATUALIZADA',
        funcionarioIds: [5],
      }),
    );
    expect(recarregarHistoricoEStatsMock).toHaveBeenCalledOnce();
    expect(showToastMock.error).not.toHaveBeenCalled();
  });

  it('sucesso: renovarAnterior = false é enviado no body', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);
    const { handleConfirmar } = buildMutations();

    await handleConfirmar(MOCK_ROW, false);

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
    const { handleConfirmar } = buildMutations();

    const result = await handleConfirmar(MOCK_ROW, true);

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Planejada já foi concluída');
    expect(showToastMock.success).not.toHaveBeenCalled();
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
    expect(emitirEventoModuloMock).not.toHaveBeenCalled();
  });

  it('erro de rede: toast de erro genérico, sem refetch', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('Network Error'));
    const { handleConfirmar } = buildMutations();

    const result = await handleConfirmar(MOCK_ROW, true);

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Erro ao confirmar qualificação');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });

  it('não altera status localmente — retorna booleano apenas', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);
    const { handleConfirmar } = buildMutations();

    const result = await handleConfirmar(MOCK_ROW, true);

    expect(typeof result).toBe('boolean');
  });
});

describe('handleReagendarPlanejada — comportamental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sucesso: PATCH com URL, body corretos; toast e refetch chamados', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);
    const { handleReagendarPlanejada } = buildMutations();

    const result = await handleReagendarPlanejada(MOCK_ROW, '2026-09-15');

    expect(result).toBe(true);
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:3000/qualificacoes/historico/101/reagendar',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ nova_data_planejada: '2026-09-15' }),
      }),
    );
    expect(showToastMock.success).toHaveBeenCalledWith('Qualificação reagendada com sucesso!');
    expect(emitirEventoModuloMock).toHaveBeenCalledWith(
      expect.objectContaining({
        modulo: 'qualificacoes',
        funcionarioIds: [5],
      }),
    );
    expect(recarregarHistoricoEStatsMock).toHaveBeenCalledOnce();
  });

  it('sem data: toast de erro, sem chamada de rede', async () => {
    const { handleReagendarPlanejada } = buildMutations();
    const result = await handleReagendarPlanejada(MOCK_ROW, '');

    expect(result).toBe(false);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(showToastMock.error).toHaveBeenCalledWith('Informe a nova data planejada');
  });

  it('erro ok: false: mensagem da API, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Data no passado não permitida' }),
    });
    const { handleReagendarPlanejada } = buildMutations();

    const result = await handleReagendarPlanejada(MOCK_ROW, '2020-01-01');

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Data no passado não permitida');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
    expect(emitirEventoModuloMock).not.toHaveBeenCalled();
  });

  it('erro de rede: toast genérico, retorna false', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('timeout'));
    const { handleReagendarPlanejada } = buildMutations();

    const result = await handleReagendarPlanejada(MOCK_ROW, '2026-10-01');

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Erro ao reagendar qualificação');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });
});

describe('handleCancelar — comportamental', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sucesso: PATCH para /cancelar; toast sucesso e refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);
    const { handleCancelar } = buildMutations();

    const result = await handleCancelar(MOCK_ROW);

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
    const { handleCancelar } = buildMutations();

    const result = await handleCancelar(MOCK_ROW);

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Qualificação não pode ser cancelada');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });
});

describe('handleConfirmDeleteMutation — implementação real', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const MOCK_DELETE_ITEM = { id: 102, nome: 'Piloto Teste - IFR' };

  it('não dispara rede se item ausente', async () => {
    const { handleConfirmDeleteMutation } = buildMutations();

    const result = await handleConfirmDeleteMutation(undefined);

    expect(result).toBe(false);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(showToastMock.error).toHaveBeenCalledWith('Qualificação inválida para deleção');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });

  it('não dispara rede se id for 0 ou negativo', async () => {
    const { handleConfirmDeleteMutation } = buildMutations();

    const resultZero = await handleConfirmDeleteMutation({ id: 0, nome: '' });
    const resultNegativo = await handleConfirmDeleteMutation({ id: -1, nome: '' });

    expect(resultZero).toBe(false);
    expect(resultNegativo).toBe(false);
    expect(fetchWithAuthMock).not.toHaveBeenCalled();
    expect(showToastMock.error).toHaveBeenCalledWith('Qualificação inválida para deleção');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });

  it('sucesso: DELETE com URL e headers corretos; toast, refetch e retorno true', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    recarregarHistoricoEStatsMock.mockResolvedValueOnce(undefined);
    const { handleConfirmDeleteMutation } = buildMutations();

    const result = await handleConfirmDeleteMutation(MOCK_DELETE_ITEM);

    expect(result).toBe(true);
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:3000/qualificacoes/historico/102',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(showToastMock.success).toHaveBeenCalledWith('"Piloto Teste - IFR" deletada com sucesso!');
    expect(recarregarHistoricoEStatsMock).toHaveBeenCalledOnce();
  });

  it('resposta 403: mensagem de permissão, sem refetch, retorna false', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ success: false, error: 'Forbidden' }),
    });
    const { handleConfirmDeleteMutation } = buildMutations();

    const result = await handleConfirmDeleteMutation(MOCK_DELETE_ITEM);

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith(
      'Permissão negada. Apenas administradores podem deletar qualificações.',
    );
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });

  it('outro erro da API: usa mensagem da API ou fallback, sem refetch', async () => {
    fetchWithAuthMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: 'Internal Server Error' }),
    });
    const { handleConfirmDeleteMutation } = buildMutations();

    const result = await handleConfirmDeleteMutation(MOCK_DELETE_ITEM);

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Internal Server Error');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });

  it('erro de rede: toast genérico, sem refetch', async () => {
    fetchWithAuthMock.mockRejectedValueOnce(new Error('Connection refused'));
    const { handleConfirmDeleteMutation } = buildMutations();

    const result = await handleConfirmDeleteMutation(MOCK_DELETE_ITEM);

    expect(result).toBe(false);
    expect(showToastMock.error).toHaveBeenCalledWith('Erro ao deletar qualificação');
    expect(recarregarHistoricoEStatsMock).not.toHaveBeenCalled();
  });
});
