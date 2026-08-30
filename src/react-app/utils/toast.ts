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

const TECHNICAL_ERROR_PATTERNS = [
  /\b(?:SQLITE(?:_ERROR)?|D1_ERROR|SQLSTATE|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/i,
  /\bno such (?:table|column)\b/i,
  /\b(?:stack trace|traceback|internal server error)\b/i,
  /\b(?:SyntaxError|TypeError|ReferenceError|RangeError):/i,
  /\bHTTP\s+[45]\d{2}\b/i,
  /\bat\s+(?:async\s+)?[\w.$<>]+\s*\([^)]*\.(?:ts|tsx|js|mjs|cjs):\d+:\d+\)/i,
  /\b(?:worker|node_modules|dist|src)[\\/][^\s)]+\.(?:ts|tsx|js|mjs|cjs):\d+/i,
  /\b(?:database|query|constraint|foreign key)\b[^\n]{0,160}\b(?:error|failed|failure|unavailable|timeout|violation|locked)\b/i,
  /\b(?:error|failed|failure|unavailable|timeout|violation|locked)\b[^\n]{0,160}\b(?:database|query|constraint|foreign key)\b/i,
  /\b(?:Cloudflare|Wrangler|D1Database|Workers? runtime)\b/i,
  /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX)|DROP\s+(?:TABLE|INDEX))\b/i,
];

export function safeVisibleToastText(
  text: string | undefined,
  fallback?: string,
): string | undefined {
  if (!text) return text;
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(text)) ? fallback : text;
}

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
    const safeMessage =
      safeVisibleToastText(message, 'Não foi possível concluir a operação.') ||
      'Não foi possível concluir a operação.';
    const safeDescription = safeVisibleToastText(options.description);

    return toast.error(safeMessage, {
      description: safeDescription,
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