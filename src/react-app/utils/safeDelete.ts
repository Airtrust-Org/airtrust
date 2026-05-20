/**
 * Validador universal para operações DELETE
 * Previne chamadas com ID null/undefined
 */

import { toast } from 'sonner';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { getAccessToken } from '@/react-app/config/api';

export interface SafeDeleteOptions {
  url: string;
  id: string | number | null | undefined;
  itemName: string;
  confirmMessage?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  token?: string;
}

export async function safeDelete(options: SafeDeleteOptions): Promise<boolean> {
  const {
    url,
    id,
    itemName,
    confirmMessage,
    onSuccess,
    onError,
    token = getAccessToken(),
  } = options;

  // Validação crítica: ID obrigatório
  if (!id || id === 'null' || id === 'undefined') {
    const errorMsg = `ID inválido para deletar ${itemName}`;
    console.error('[safeDelete]', errorMsg, { id, url });
    if (onError) {
      onError(errorMsg);
    } else {
      toast.error(errorMsg);
    }
    return false;
  }

  // Confirmação do usuário
  const message = confirmMessage || `Tem certeza que deseja deletar ${itemName}?`;
  if (!(await confirmDialog(message, { title: 'Confirmar exclusão', confirmText: 'Excluir' }))) {
    return false;
  }

  try {
    const response = await fetch(`${url}/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });

    if (!response.ok) {
      // 403: Permissão negada (RBAC)
      if (response.status === 403) {
        const errorMsg = `Permissão negada. Apenas administradores podem deletar ${itemName}.`;
        console.error('[safeDelete] 403 RBAC_FORBIDDEN', { id, url });
        if (onError) {
          onError(errorMsg);
        } else {
          toast.error(errorMsg);
        }
        return false;
      }

      // Outros erros HTTP
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error || `Erro HTTP ${response.status} ao deletar ${itemName}`;
      throw new Error(errorMsg);
    }

    if (onSuccess) {
      onSuccess();
    }

    return true;
  } catch (error) {
    const errorMsg = `Erro ao deletar ${itemName}: ${
      error instanceof Error ? error.message : 'Erro desconhecido'
    }`;
    console.error('[safeDelete]', errorMsg);
    if (onError) {
      onError(errorMsg);
    } else {
      toast.error(errorMsg);
    }
    return false;
  }
}
