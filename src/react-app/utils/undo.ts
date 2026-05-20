
import { showToast } from './toast';

interface UndoAction {
  id: string;
  type: 'delete';
  endpoint: string;
  data: any;
  onUndo: () => void;
}

let currentUndoAction: UndoAction | null = null;

export const undoManager = {
  registerDelete: (
    id: string,
    endpoint: string,
    data: any,
    onUndo: () => void
  ) => {
    currentUndoAction = {
      id,
      type: 'delete',
      endpoint,
      data,
      onUndo
    };

    const toastId = showToast.success(
      'Item excluído. Clique para desfazer.'
    );

    setTimeout(() => {
      if (currentUndoAction?.id === id) {
        currentUndoAction = null;
      }
    }, 5000);

    return toastId;
  },

  undo: async () => {
    if (!currentUndoAction) {
      showToast.error('Nenhuma ação para desfazer');
      return false;
    }

    try {
      const response = await fetch(`${currentUndoAction.endpoint}/${currentUndoAction.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        currentUndoAction.onUndo();
        showToast.success('Ação desfeita com sucesso!');
        currentUndoAction = null;
        return true;
      } else {
        showToast.error('Erro ao desfazer ação');
        return false;
      }
    } catch (error) {
      console.error('Erro ao desfazer:', error);
      showToast.error('Erro ao desfazer ação');
      return false;
    }
  },

  canUndo: () => currentUndoAction !== null,

  clear: () => {
    currentUndoAction = null;
  }
};
