/**
 * ModalOverlay — adaptador de acessibilidade para modais "artesanais".
 *
 * Substitui o `<div className="fixed inset-0 ...">` de modais inline sem alterar
 * o layout: renderiza o mesmo elemento e, ao montar, dá ao painel interno a
 * semântica de diálogo (`role="dialog"`, `aria-modal`, nome acessível a partir do
 * primeiro título) e liga `useModalA11y` (foco inicial, trap de Tab, Escape só no
 * topo, bloqueio de rolagem e devolução do foco).
 *
 * Escape reaproveita o fechamento que o modal já tem: o clique do backdrop
 * (`onClick` do overlay) ou, na falta dele, o botão "Fechar/Cancelar/Voltar".
 *
 * Use enquanto o modal não é migrado para `BaseModal`.
 */
import { useCallback, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { useModalA11y } from '@/react-app/hooks/useModalA11y';

const CLOSE_LABEL = /^(fechar|cancelar|voltar|close|cancel)$/i;

function findDialogElement(overlay: HTMLElement | null): HTMLElement | null {
  if (!overlay) return null;
  const candidates = Array.from(overlay.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !(el.className?.toString().includes('absolute') && el.className.toString().includes('inset-0') && el.children.length === 0),
  );
  // Painéis que envolvem o diálogo em um container de centralização
  const first = candidates[0] ?? null;
  if (first && candidates.length === 1 && first.children.length === 1) {
    const only = first.children[0];
    const cls = first.className?.toString() ?? '';
    if (only instanceof HTMLElement && /\b(flex|grid)\b/.test(cls) && !first.querySelector('h1,h2,h3,h4')) {
      return only;
    }
  }
  return first;
}

let overlaySeq = 0;

export function ModalOverlay({ children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const hasBackdropClick = Boolean(rest.onClick);

  useLayoutEffect(() => {
    const dialog = findDialogElement(overlayRef.current);
    dialogRef.current = dialog;
    if (!dialog) return;
    // `role="presentation"` estático (usado só para satisfazer o lint de painéis que
    // interrompem a propagação do clique) não é um papel real: vira diálogo.
    const currentRole = dialog.getAttribute('role');
    if (!currentRole || currentRole === 'presentation') dialog.setAttribute('role', 'dialog');
    if (!dialog.hasAttribute('aria-modal')) dialog.setAttribute('aria-modal', 'true');
    if (!dialog.hasAttribute('aria-labelledby') && !dialog.hasAttribute('aria-label')) {
      const heading = dialog.querySelector<HTMLElement>('h1,h2,h3,h4');
      if (heading) {
        if (!heading.id) heading.id = `modal-overlay-title-${++overlaySeq}`;
        dialog.setAttribute('aria-labelledby', heading.id);
      } else {
        dialog.setAttribute('aria-label', 'Janela de diálogo');
      }
    }
  }, []);

  const close = useCallback(() => {
    const overlay = overlayRef.current;
    if (overlay && hasBackdropClick) {
      overlay.click();
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) return;
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const closer =
      buttons.find((b) => CLOSE_LABEL.test((b.getAttribute('aria-label') ?? '').trim())) ??
      buttons.find((b) => CLOSE_LABEL.test((b.textContent ?? '').trim()));
    closer?.click();
  }, [hasBackdropClick]);

  useModalA11y({ isOpen: true, onClose: close, dialogRef });

  return (
    <div ref={overlayRef} {...rest}>
      {children}
    </div>
  );
}
