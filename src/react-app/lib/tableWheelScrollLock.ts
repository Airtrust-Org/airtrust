type AnyHTMLElement = HTMLElement & { parentElement: AnyHTMLElement | null };

function hasScrollableOverflow(el: AnyHTMLElement): boolean {
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const overflow = style.overflow;

  const overflowAllowsScroll =
    overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';

  const overflowYAllowsScroll =
    overflowY === 'auto' ||
    overflowY === 'scroll' ||
    overflowY === 'overlay' ||
    overflowAllowsScroll;

  const overflowXAllowsScroll =
    overflowX === 'auto' ||
    overflowX === 'scroll' ||
    overflowX === 'overlay' ||
    overflowAllowsScroll;

  // Verificar se realmente pode rolar (scrollHeight > clientHeight ou scrollWidth > clientWidth)
  // Verificar se realmente pode rolar (scrollHeight > clientHeight ou scrollWidth > clientWidth)
  const canScrollY = overflowYAllowsScroll && el.scrollHeight > el.clientHeight;
  const canScrollX = overflowXAllowsScroll && el.scrollWidth > el.clientWidth;

  return canScrollY || canScrollX;
}

function findScrollableContainerForTable(target: HTMLElement | null): AnyHTMLElement | null {
  if (!target) return null;
  const table = target.closest('table');
  if (!table) return null;

  let el = table.parentElement as AnyHTMLElement | null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (hasScrollableOverflow(el)) return el;
    el = el.parentElement as AnyHTMLElement | null;
  }
  return null;
}

/**
 * Locks mouse-wheel scrolling to a table's scroll container when the pointer is over the table.
 *
 * Behavior:
 * - Pointer over a table inside a scrollable container: scrolls the container and prevents page scroll.
 * - Pointer outside tables (or tables without scrollable container): page scroll behaves normally.
 */
export function installTableWheelScrollLock(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onWheel = (e: WheelEvent) => {
    if (e.defaultPrevented) return;

    // Don't interfere with browser zoom gestures (Ctrl/⌘ + wheel)
    if (e.ctrlKey || e.metaKey) return;

    const target = e.target as HTMLElement | null;
    const container = findScrollableContainerForTable(target);
    if (!container) return;

    // Verificar se o container realmente pode rolar na direção do wheel
    const canScrollY = container.scrollHeight > container.clientHeight;
    const canScrollX = container.scrollWidth > container.clientWidth;

    // Se não pode rolar em nenhuma direção, não bloquear o scroll da página
    if (!canScrollY && !canScrollX) return;

    // Redirecionar wheel deltas para o container e bloquear scroll da página
    if (canScrollY && e.deltaY !== 0) {
      container.scrollTop += e.deltaY;
      e.preventDefault();
    }
    if (canScrollX && e.deltaX !== 0) {
      container.scrollLeft += e.deltaX;
      e.preventDefault();
    }
  };

  // Capture + non-passive to guarantee we can preventDefault before the page scrolls.
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });

  return () => {
    window.removeEventListener('wheel', onWheel, true);
  };
}
