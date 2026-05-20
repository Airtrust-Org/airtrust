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
    window.alert(message);
    return;
  }

  alertDialogHandler({
    message,
    ...options,
  });
}
