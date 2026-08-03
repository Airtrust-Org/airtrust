import DOMPurify from 'dompurify';

const PPTX_FORBIDDEN_TAGS = ['script', 'iframe', 'object', 'embed'] as const;
const PPTX_FORBIDDEN_ATTRIBUTES = ['srcdoc'] as const;

/**
 * Sanitiza o HTML produzido por `@jvmr/pptx-to-html` antes de qualquer
 * inserção no DOM. Mantém a estrutura visual legítima do slide (HTML, SVG,
 * estilos e imagens) e remove superfícies executáveis ou navegáveis usadas em
 * XSS persistente.
 */
export function sanitizePptxSlideHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: [...PPTX_FORBIDDEN_TAGS],
    FORBID_ATTR: [...PPTX_FORBIDDEN_ATTRIBUTES],
  });
}
