/**
 * showToast — wrapper centralizado sobre sonner
 *
 * Use SEMPRE este helper em vez de importar { toast } do sonner diretamente.
 * Garante consistência de duração, posição e estilo em todo o sistema.
 */
import { toast } from 'sonner';

type ToastOptions = {
  description?: string;
  duration?: number;
};

function normalizeToastOptions(descriptionOrOptions?: string | ToastOptions): ToastOptions {
  if (!descriptionOrOptions) {
    return {};
  }

  if (typeof descriptionOrOptions === 'string') {
    return { description: descriptionOrOptions };
  }

  return descriptionOrOptions;
}

export const showToast = {
  success: (message: string, descriptionOrOptions?: string | ToastOptions) => {
    const options = normalizeToastOptions(descriptionOrOptions);
    return toast.success(message, {
      description: options.description,
      duration: options.duration ?? 3000,
    });
  },

  error: (message: string, descriptionOrOptions?: string | ToastOptions) => {
    const options = normalizeToastOptions(descriptionOrOptions);
    return toast.error(message, {
      description: options.description,
      duration: options.duration ?? 5000,
    });
  },

  warning: (message: string, descriptionOrOptions?: string | ToastOptions) => {
    const options = normalizeToastOptions(descriptionOrOptions);
    return toast.warning(message, {
      description: options.description,
      duration: options.duration ?? 4000,
    });
  },

  info: (message: string, descriptionOrOptions?: string | ToastOptions) => {
    const options = normalizeToastOptions(descriptionOrOptions);
    return toast.info(message, {
      description: options.description,
      duration: options.duration ?? 3000,
    });
  },

  loading: (message: string) => {
    return toast.loading(message);
  },

  promise: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    },
  ) => {
    return toast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
    });
  },

  dismiss: (toastId?: string | number) => {
    toast.dismiss(toastId);
  },
};
