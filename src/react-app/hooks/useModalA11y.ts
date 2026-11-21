/**
 * useModalA11y — comportamento de teclado e foco compartilhado pelos modais.
 *
 * - Move o foco para dentro do diálogo ao abrir (sem roubar foco já posicionado
 *   por `autoFocus`) e o devolve ao elemento de origem ao fechar.
 * - Prende a tecla Tab dentro do diálogo.
 * - Mantém uma pilha: apenas o modal do topo reage a Escape, então fechar um
 *   modal aninhado não fecha o que está por baixo.
 * - Bloqueio de rolagem do body com contagem de referências, para que fechar um
 *   modal empilhado não libere a rolagem enquanto outro continua aberto.
 */
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const modalStack: symbol[] = [];
let scrollLockCount = 0;
let previousBodyOverflow = '';

function lockScroll() {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function unlockScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

/**
 * Visível e elegível à navegação sequencial: sem `display:none`/`visibility:hidden`
 * no próprio elemento ou em qualquer ancestral até o contêiner, sem `hidden`/`inert`
 * e sem `aria-hidden`. Alterações de layout (`getClientRects`) não são usadas porque
 * não existem em jsdom; o estilo computado cobre CSS e atributos.
 */
function isVisibleWithin(el: HTMLElement, container: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.hasAttribute('inert')) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(node);
    if (style.display === 'none') return false;
    if (node === el && (style.visibility === 'hidden' || style.visibility === 'collapse')) {
      return false;
    }
    if (node === container) break;
  }
  return true;
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    // `tabIndex < 0` remove controles fora da ordem de Tab (ex.: tabindex="-1")
    (el) => el.tabIndex >= 0 && isVisibleWithin(el, container),
  );
}

function focusInitialElement(dialog: HTMLElement) {
  if (dialog.contains(document.activeElement) && document.activeElement !== dialog) return;

  const preferred = dialog.querySelector<HTMLElement>('[data-autofocus]');
  if (preferred) {
    preferred.focus();
    return;
  }

  const body = dialog.querySelector<HTMLElement>('[data-modal-body]');
  const inBody = body ? getFocusableElements(body)[0] : undefined;
  const target = inBody ?? getFocusableElements(dialog)[0];
  if (target) {
    target.focus();
  } else {
    dialog.focus();
  }
}

interface UseModalA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  dialogRef: RefObject<HTMLElement | null>;
}

export function useModalA11y({ isOpen, onClose, dialogRef }: UseModalA11yOptions) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const token = Symbol('modal');
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalStack.push(token);
    lockScroll();

    const dialog = dialogRef.current;
    if (dialog) {
      if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');
      focusInitialElement(dialog);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const current = dialogRef.current;
      if (!current) return;

      const focusable = getFocusableElements(current);
      if (focusable.length === 0) {
        event.preventDefault();
        current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!current.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = modalStack.indexOf(token);
      if (index >= 0) modalStack.splice(index, 1);
      unlockScroll();
      if (opener && opener.isConnected) opener.focus();
    };
  }, [isOpen, dialogRef]);
}
