/**
 * Sanitização e auditoria de HTML importado para a Biblioteca de Guias do
 * Instrutor de Simulador.
 *
 * Mecanismo principal: parser estrutural (parse5, HTML5-spec compliant,
 * puro JS, compatível com o runtime de Workers). O documento é convertido
 * em árvore, uma allowlist explícita de tags e atributos é aplicada
 * recursivamente (remove-por-padrão: qualquer tag/atributo fora da lista é
 * descartado, não apenas "escapado"), e o resultado é resserializado.
 *
 * Regex é usado apenas como checagem residual auxiliar sobre o HTML já
 * serializado — nunca como mecanismo primário de decisão do que é seguro.
 */

import { parse, serialize, defaultTreeAdapter } from 'parse5';
import type { DefaultTreeAdapterTypes as TreeTypes } from 'parse5';

export interface HtmlSanitizationResult {
  html: string;
  sanitizado: boolean;
  scriptsRemovidos: number;
  referenciasExternasRemovidas: string[];
  alertas: string[];
  aprovado: boolean;
}

export interface GuiaAsset {
  bytes: Uint8Array;
  mimeType: string;
}

// ── Allowlist ────────────────────────────────────────────────────────────
// Cobre exatamente o vocabulário observado nos guias AW139/SK76 (auditado
// manualmente) + um punhado de tags estruturais equivalentes/seguras.
// Qualquer tag fora desta lista é removida (com toda a subárvore).
const ALLOWED_TAGS = new Set([
  'html',
  'head',
  'body',
  'title',
  'style',
  'div',
  'span',
  'section',
  'article',
  'header',
  'footer',
  'nav',
  'main',
  'aside',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'br',
  'hr',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'colgroup',
  'col',
  'caption',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'small',
  'sub',
  'sup',
  'mark',
  'code',
  'pre',
  'img',
  'figure',
  'figcaption',
  'blockquote',
  'abbr',
  'time',
]);

// Tags explicitamente perigosas/executáveis/de navegação — removidas junto
// com toda a subárvore, mesmo que ALLOWED_TAGS não as liste (defesa em
// profundidade; a allowlist já as excluiria de qualquer forma).
const HARD_BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'base',
  'link',
  'svg',
  'math',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'noscript',
  'template',
  'slot',
  'dialog',
  'frame',
  'frameset',
  'param',
  'meta', // meta é tratado à parte (charset/viewport são reescritos explicitamente)
]);

const GLOBAL_SAFE_ATTRS = new Set(['class', 'id', 'lang', 'title']);
const TAG_EXTRA_ATTRS: Record<string, Set<string>> = {
  html: new Set(['lang']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  col: new Set(['span']),
};
// style é permitido em qualquer tag, mas o valor passa por sanitizeCssValue.
const STYLE_ATTR = 'style';

const CSS_DANGEROUS_PATTERN = /@import|expression\s*\(|javascript:|vbscript:|-moz-binding|behavior\s*:/gi;
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

function sanitizeCssValue(value: string, referenciasExternasRemovidas: string[]): string {
  let out = value.replace(CSS_URL_PATTERN, (match, _quote, url: string) => {
    if (/^data:/i.test(url.trim())) return match;
    referenciasExternasRemovidas.push(url.trim());
    return 'none';
  });
  out = out.replace(CSS_DANGEROUS_PATTERN, '');
  return out;
}

function isElement(node: TreeTypes.ChildNode | TreeTypes.Node): node is TreeTypes.Element {
  return 'tagName' in (node as TreeTypes.Element);
}

function sanitizeElementAttrs(
  el: TreeTypes.Element,
  referenciasExternasRemovidas: string[],
  alertas: string[],
): void {
  const tag = el.tagName.toLowerCase();
  const allowedForTag = TAG_EXTRA_ATTRS[tag];

  el.attrs = el.attrs.filter((attr) => {
    const name = attr.name.toLowerCase();

    // Nunca permitir handlers de evento, independentemente de allowlist —
    // defesa em profundidade explícita, mesmo que nenhuma tag os liste.
    if (name.startsWith('on')) {
      alertas.push(`atributo de evento removido: ${name} em <${tag}>`);
      return false;
    }

    if (name === STYLE_ATTR) {
      attr.value = sanitizeCssValue(attr.value, referenciasExternasRemovidas);
      return true;
    }

    if (name === 'src' || name === 'href') {
      // Após inlineLocalAssets, referências legítimas já viraram data:.
      // Qualquer outra coisa (http(s):, javascript:, vbscript:, file:,
      // relativo não resolvido) é removida — nunca mantida "como está".
      if (/^data:image\//i.test(attr.value.trim())) {
        return tag === 'img';
      }
      referenciasExternasRemovidas.push(attr.value);
      return false;
    }

    if (GLOBAL_SAFE_ATTRS.has(name)) return true;
    if (allowedForTag?.has(name)) return true;

    return false;
  });
}

function walk(
  parent: TreeTypes.ParentNode,
  ctx: {
    scriptsRemovidos: number;
    referenciasExternasRemovidas: string[];
    alertas: string[];
    assets: Record<string, GuiaAsset> | undefined;
  },
): void {
  const kept: TreeTypes.ChildNode[] = [];

  for (const node of parent.childNodes) {
    if (node.nodeName === '#comment') {
      // Comentários nunca são publicados (podem conter notas internas,
      // prompts de geração, dados de depuração).
      continue;
    }

    if (node.nodeName === '#text') {
      kept.push(node);
      continue;
    }

    if (isElement(node)) {
      const tag = node.tagName.toLowerCase();

      if (tag === 'script') {
        ctx.scriptsRemovidos += 1;
        continue;
      }

      if (HARD_BLOCKED_TAGS.has(tag)) {
        if (tag !== 'meta') {
          ctx.alertas.push(`tag removida: <${tag}>`);
        }
        continue;
      }

      if (tag === 'meta') {
        // Mantém apenas charset/viewport; descarta http-equiv (ex: refresh)
        // e qualquer outro meta não reconhecido.
        const hasHttpEquiv = node.attrs.some((a) => a.name.toLowerCase() === 'http-equiv');
        const isCharsetOrViewport = node.attrs.some(
          (a) =>
            a.name.toLowerCase() === 'charset' ||
            (a.name.toLowerCase() === 'name' && a.value.toLowerCase() === 'viewport'),
        );
        if (hasHttpEquiv || !isCharsetOrViewport) {
          ctx.alertas.push('meta não reconhecido/http-equiv removido');
          continue;
        }
        node.attrs = node.attrs.filter((a) =>
          ['charset', 'name', 'content'].includes(a.name.toLowerCase()),
        );
        kept.push(node);
        continue;
      }

      if (!ALLOWED_TAGS.has(tag)) {
        ctx.alertas.push(`tag fora da allowlist removida: <${tag}>`);
        continue;
      }

      if (tag === 'style') {
        // Sanitiza o texto do <style> (pode conter @import/url() externo).
        for (const child of node.childNodes) {
          if (!isElement(child) && child.nodeName === '#text') {
            child.value = sanitizeCssValue(child.value, ctx.referenciasExternasRemovidas);
          }
        }
        kept.push(node);
        continue;
      }

      sanitizeElementAttrs(node, ctx.referenciasExternasRemovidas, ctx.alertas);
      walk(node, ctx);
      kept.push(node);
      continue;
    }

    // DocumentType e outros nós estruturais são preservados como estão.
    kept.push(node);
  }

  parent.childNodes = kept;
}

function inlineLocalAssets(root: TreeTypes.ParentNode, assets: Record<string, GuiaAsset> | undefined): void {
  if (!assets || Object.keys(assets).length === 0) return;
  const resolvedAssets = assets;

  function visit(node: TreeTypes.ParentNode) {
    for (const child of node.childNodes) {
      if (isElement(child)) {
        for (const attr of child.attrs) {
          if (attr.name.toLowerCase() !== 'src' && attr.name.toLowerCase() !== 'href') continue;
          if (/^(https?:|data:|javascript:|vbscript:)/i.test(attr.value.trim())) continue;
          const basename = attr.value.split('/').pop() || '';
          const asset = resolvedAssets[basename];
          if (!asset) continue;
          const base64 = Buffer.from(asset.bytes).toString('base64');
          attr.value = `data:${asset.mimeType};base64,${base64}`;
        }
        visit(child);
      }
    }
  }

  visit(root);
}

const LOCALHOST_PATTERN = '\\b(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)\\b';
const FILE_PROTOCOL_PATTERN = '\\bfile://';

export function sanitizeGuiaHtml(
  rawHtml: string,
  assets?: Record<string, GuiaAsset>,
): HtmlSanitizationResult {
  const alertas: string[] = [];
  const referenciasExternasRemovidas: string[] = [];

  const rawHadLocalhost = new RegExp(LOCALHOST_PATTERN, 'i').test(rawHtml);
  const rawHadFileProtocol = new RegExp(FILE_PROTOCOL_PATTERN, 'i').test(rawHtml);
  if (rawHadLocalhost) alertas.push('referência a localhost encontrada no HTML original');
  if (rawHadFileProtocol) alertas.push('referência a file:// encontrada no HTML original');

  const document = parse(rawHtml);

  const ctx = {
    scriptsRemovidos: 0,
    referenciasExternasRemovidas,
    alertas,
    assets,
  };

  inlineLocalAssets(document, assets);
  walk(document, ctx);

  const html = serialize(document, { treeAdapter: defaultTreeAdapter });

  // Checagem residual — auxiliar, não é o mecanismo de decisão principal
  // (esse já rodou estruturalmente acima). Serve como rede de segurança
  // contra falhas de serialização ou lacunas não previstas na allowlist.
  const remainingScript = /<script\b/i.test(html);
  const remainingIframe = /<iframe\b/i.test(html);
  const remainingForm = /<form\b/i.test(html);
  const remainingEventHandler = /\son[a-z]+\s*=/i.test(html);
  const remainingExternalUrl = /(src|href)\s*=\s*["']https?:\/\//i.test(html);
  const remainingLocalhost = new RegExp(LOCALHOST_PATTERN, 'i').test(html);

  if (remainingScript) alertas.push('script residual detectado pós-sanitização');
  if (remainingIframe) alertas.push('iframe residual detectado pós-sanitização');
  if (remainingForm) alertas.push('form residual detectado pós-sanitização');
  if (remainingEventHandler) alertas.push('handler de evento residual detectado pós-sanitização');
  if (remainingExternalUrl) alertas.push('URL externa residual detectada pós-sanitização');
  if (remainingLocalhost) alertas.push('referência a localhost residual pós-sanitização');

  const aprovado =
    !remainingScript &&
    !remainingIframe &&
    !remainingForm &&
    !remainingEventHandler &&
    !remainingExternalUrl &&
    !remainingLocalhost &&
    !rawHadLocalhost &&
    !rawHadFileProtocol;

  return {
    html,
    sanitizado: true,
    scriptsRemovidos: ctx.scriptsRemovidos,
    referenciasExternasRemovidas,
    alertas,
    aprovado,
  };
}
