interface HistoricoMutationItem {
  id: number;
  funcionario_id?: number;
}

interface ConfirmDeleteMutationItem {
  id: number;
  nome: string;
}

interface QualificacoesMutationsDeps {
  API_BASE_URL: string;
  fetchWithAuth: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<{
    ok: boolean;
    json: () => Promise<any>;
  }>;
  showToast: {
    success: (message: string) => void;
    error: (message: string) => void;
  };
  emitirEventoModulo: (payload: {
    modulo: string;
    tipo: string;
    funcionarioIds?: number[];
  }) => void;
  recarregarHistoricoEStats: () => Promise<void>;
}

export function useQualificacoesMutations(deps: QualificacoesMutationsDeps) {
  const handleConfirmar = async (
    row: HistoricoMutationItem,
    renovarAnterior = true,
  ): Promise<boolean> => {
    try {
      const response = await deps.fetchWithAuth(
        `${deps.API_BASE_URL}/qualificacoes/historico/${row.id}/confirmar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
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
    } catch (error) {
      console.error('Erro ao confirmar:', error);
      deps.showToast.error('Erro ao confirmar qualificação');
    }

    return false;
  };

  const handleCancelar = async (row: HistoricoMutationItem): Promise<boolean> => {
    try {
      const response = await deps.fetchWithAuth(
        `${deps.API_BASE_URL}/qualificacoes/historico/${row.id}/cancelar`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
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
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      deps.showToast.error('Erro ao cancelar qualificação');
    }

    return false;
  };

  const handleReagendarPlanejada = async (
    row: HistoricoMutationItem,
    novaData: string,
  ): Promise<boolean> => {
    if (!novaData) {
      deps.showToast.error('Informe a nova data planejada');
      return false;
    }

    try {
      const response = await deps.fetchWithAuth(
        `${deps.API_BASE_URL}/qualificacoes/historico/${row.id}/reagendar`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
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
    } catch (error) {
      console.error('Erro ao reagendar qualificação:', error);
      deps.showToast.error('Erro ao reagendar qualificação');
      return false;
    }
  };

  const handleConfirmDeleteMutation = async (
    item: ConfirmDeleteMutationItem | null | undefined,
  ): Promise<boolean> => {
    if (!item || item.id <= 0) {
      deps.showToast.error('Qualificação inválida para deleção');
      return false;
    }

    const { id, nome } = item;

    try {
      const response = await deps.fetchWithAuth(
        `${deps.API_BASE_URL}/qualificacoes/historico/${id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const json = await response.json();

      if (json.success) {
        deps.showToast.success(`"${nome}" deletada com sucesso!`);
        await deps.recarregarHistoricoEStats();
        return true;
      }

      if (response.status === 403) {
        deps.showToast.error(
          'Permissão negada. Apenas administradores podem deletar qualificações.',
        );
      } else {
        deps.showToast.error(json.error || 'Erro ao deletar qualificação');
      }
    } catch (error) {
      console.error('Erro ao deletar qualificação:', error);
      deps.showToast.error('Erro ao deletar qualificação');
    }

    return false;
  };

  return {
    handleConfirmar,
    handleCancelar,
    handleReagendarPlanejada,
    handleConfirmDeleteMutation,
  };
}
