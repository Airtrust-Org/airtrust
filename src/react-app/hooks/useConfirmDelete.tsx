import { useState } from 'react';
import ConfirmDeleteModal from '../components/modals/ConfirmDeleteModal';

interface UseConfirmDeleteOptions {
  title?: string;
  message: string;
  itemName?: string;
  onConfirm: () => void | Promise<void>;
}

export function useConfirmDelete() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<UseConfirmDeleteOptions | null>(null);

  const confirm = (opts: UseConfirmDeleteOptions) => {
    setOptions(opts);
    setIsOpen(true);
  };

  const handleConfirm = async () => {
    if (options?.onConfirm) {
      await options.onConfirm();
    }
    setIsOpen(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const ConfirmDialog = () => {
    if (!options) return null;

    return (
      <ConfirmDeleteModal
        isOpen={isOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        title={options.title}
        message={options.message}
        itemName={options.itemName}
      />
    );
  };

  return {
    confirm,
    ConfirmDialog
  };
}
