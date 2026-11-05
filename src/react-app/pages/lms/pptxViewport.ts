/**
 * Keep the learner PPTX player usable on browsers without ResizeObserver.
 * Exceptions thrown by an effect otherwise trip the application-wide error
 * boundary even though the presentation asset loaded successfully.
 */
export function observePptxSlideLayout(
  measure: () => void,
  elements: Array<Element | null>,
): () => void {
  let disposed = false;
  let pendingFrame: number | null = null;

  const scheduleMeasure = () => {
    if (disposed || pendingFrame !== null) return;
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = null;
      if (!disposed) measure();
    });
  };

  scheduleMeasure();

  let observer: ResizeObserver | null = null;
  try {
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleMeasure);
      for (const element of elements) {
        if (element) observer.observe(element);
      }
    }
  } catch {
    observer?.disconnect();
    observer = null;
  }

  // Old/managed browsers may lack the API or ship a failing polyfill.
  if (!observer) window.addEventListener('resize', scheduleMeasure);

  return () => {
    disposed = true;
    observer?.disconnect();
    if (!observer) window.removeEventListener('resize', scheduleMeasure);
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
  };
}
