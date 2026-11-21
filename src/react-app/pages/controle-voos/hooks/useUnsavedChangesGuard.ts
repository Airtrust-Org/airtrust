import { useCallback, useEffect } from 'react';
import { useBeforeUnload, useNavigate } from 'react-router-dom';

/**
 * Protects against leaving with pending RDV edits.
 * - beforeunload for tab close / refresh
 * - confirmLeave() for in-app navigation (BrowserRouter has no useBlocker)
 */
export function useUnsavedChangesGuard(
  when: boolean,
  message = 'Há alterações não salvas. Deseja sair?',
) {
  useBeforeUnload(
    useCallback(
      (event) => {
        if (!when) return;
        event.preventDefault();
        // Chrome requires returnValue to be set
        event.returnValue = message;
      },
      [message, when],
    ),
  );

  const navigate = useNavigate();

  const confirmLeave = useCallback(
    (to: string) => {
      if (!when) {
        navigate(to);
        return true;
      }
      // Navegação síncrona: o retorno booleano precisa ser conhecido na hora.
      // eslint-disable-next-line no-alert
      const ok = window.confirm(message);
      if (ok) navigate(to);
      return ok;
    },
    [message, navigate, when],
  );

  // Intercept browser back when dirty (best-effort without data router)
  useEffect(() => {
    if (!when) return;
    const onPopState = () => {
      // popstate não pode ser adiado: o histórico já mudou quando o evento dispara.
      // eslint-disable-next-line no-alert
      if (!window.confirm(message)) {
        window.history.pushState(null, '', window.location.href);
      }
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [message, when]);

  return { confirmLeave };
}
