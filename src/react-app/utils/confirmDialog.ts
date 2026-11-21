type ConfirmDialogOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
};

type AlertDialogOptions = {
  title?: string;
  confirmText?: string;
};

type ConfirmDialogRequest = ConfirmDialogOptions & {
  message: string;
  resolve: (confirmed: boolean) => void;
};

type ConfirmDialogHandler = (request: ConfirmDialogRequest) => void;
type AlertDialogRequest = AlertDialogOptions & {
  message: string;
};
type AlertDialogHandler = (request: AlertDialogRequest) => void;

let confirmDialogHandler: ConfirmDialogHandler | null = null;
let alertDialogHandler: AlertDialogHandler | null = null;

export function registerConfirmDialogHandler(handler: ConfirmDialogHandler | null) {
  confirmDialogHandler = handler;
}

export function registerAlertDialogHandler(handler: AlertDialogHandler | null) {
  alertDialogHandler = handler;
}

export function confirmDialog(
  message: string,
  options: ConfirmDialogOptions = {},
): Promise<boolean> {
  if (!confirmDialogHandler) {
    // Fallback quando o host global ainda não montou (ex.: testes, boot).
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.confirm(message));
  }

  return new Promise<boolean>((resolve) => {
    confirmDialogHandler?.({
      message,
      resolve,
      ...options,
    });
  });
}

export function showAlertDialog(message: string, options: AlertDialogOptions = {}) {
  if (!alertDialogHandler) {
    // eslint-disable-next-line no-alert
    window.alert(message);
    return;
  }

  alertDialogHandler({
    message,
    ...options,
  });
}

type PromptDialogOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Texto de ajuda exibido abaixo do campo (ex.: tamanho mínimo). */
  helperText?: string;
  /** Quando true, o campo é obrigatório e vazio mantém "Confirmar" desabilitado. */
  required?: boolean;
  /** Tamanho mínimo (após trim) para habilitar "Confirmar". */
  minLength?: number;
  multiline?: boolean;
};

export type PromptDialogRequest = PromptDialogOptions & {
  message: string;
  resolve: (value: string | null) => void;
};

type PromptDialogHandler = (request: PromptDialogRequest) => void;
let promptDialogHandler: PromptDialogHandler | null = null;

export function registerPromptDialogHandler(handler: PromptDialogHandler | null) {
  promptDialogHandler = handler;
}

/**
 * Substituto assíncrono de `window.prompt`. Resolve com o texto digitado ou
 * `null` quando o usuário cancela.
 */
export function promptDialog(
  message: string,
  options: PromptDialogOptions = {},
): Promise<string | null> {
  if (!promptDialogHandler) {
    // eslint-disable-next-line no-alert
    return Promise.resolve(window.prompt(message, options.defaultValue ?? ''));
  }

  return new Promise<string | null>((resolve) => {
    promptDialogHandler?.({ message, resolve, ...options });
  });
}
