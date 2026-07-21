/**
 * Sanitização e auditoria de HTML importado para a Biblioteca de Guias do
 * Instrutor de Simulador.
 *
 * Os guias fornecidos (AW139/SK76) são páginas estáticas de impressão
 * (HTML+CSS local, um único botão `onclick="window.print()"`, sem scripts
 * externos, iframes, forms ou chamadas de rede). O sanitizador remove
 * qualquer coisa executável ou que aponte para fora do documento, e é
 * conservador: se algo suspeito sobrar após a limpeza, o resultado é
 * REJEITADO em vez de publicado.
 *
 * Não usa parser de DOM (Workers não têm um nativo); opera com remoções
 * regex direcionadas e depois valida que nada perigoso restou.
 */

export interface HtmlSanitizationResult {
  html: string;
  sanitizado: boolean;
  scriptsRemovidos: number;
  referenciasExternasRemovidas: string[];
  alertas: string[];
  aprovado: boolean;
}

const SCRIPT_TAG = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SELF_CLOSING_SCRIPT = /<script\b[^>]*\/>/gi;
const IFRAME_TAG = /<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi;
const OBJECT_EMBED_TAG = /<(object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const FORM_TAG = /<form\b[^>]*>[\s\S]*?<\/form\s*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const META_REFRESH = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi;
const LINK_EXTERNAL = /<link\b[^>]*href\s*=\s*["']https?:\/\/[^"'>]*["'][^>]*>/gi;
const EVENT_HANDLER_ATTR = /\son[a-z]+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi;
const JS_URL_ATTR = /(src|href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi;
const EXTERNAL_URL_ATTR = /(src|href)\s*=\s*(["'])\s*(https?:)\/\/([^"']*)\2/gi;
const LOCALHOST_PATTERN = '\\b(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)\\b';
const FILE_PROTOCOL_PATTERN = '\\bfile://';

export interface GuiaAsset {
  bytes: Uint8Array;
  mimeType: string;
}

/**
 * Assets locais (ex: logo) referenciados por caminho relativo no HTML
 * original são embutidos como data: URI, tornando o documento sanitizado
 * autocontido — sem depender de uma rota adicional de arquivos estáticos
 * dentro do iframe sandboxed (que roda sem acesso de rede).
 */
function inlineLocalAssets(html: string, assets: Record<string, GuiaAsset> | undefined): string {
  if (!assets || Object.keys(assets).length === 0) return html;

  return html.replace(/(src|href)\s*=\s*(["'])((?:(?!\2)(?!https?:\/\/)(?!data:).)*)\2/gi, (match, attr, quote, relPath) => {
    const basename = String(relPath).split('/').pop() || '';
    const asset = assets[basename];
    if (!asset) return match;
    const base64 = Buffer.from(asset.bytes).toString('base64');
    return `${attr}=${quote}data:${asset.mimeType};base64,${base64}${quote}`;
  });
}

export function sanitizeGuiaHtml(
  rawHtml: string,
  assets?: Record<string, GuiaAsset>,
): HtmlSanitizationResult {
  const alertas: string[] = [];
  const referenciasExternasRemovidas: string[] = [];
  let html = inlineLocalAssets(rawHtml, assets);
  let scriptsRemovidos = 0;

  const scriptMatches = html.match(SCRIPT_TAG) || [];
  scriptsRemovidos += scriptMatches.length;
  html = html.replace(SCRIPT_TAG, '');
  html = html.replace(SELF_CLOSING_SCRIPT, () => {
    scriptsRemovidos += 1;
    return '';
  });

  html = html.replace(IFRAME_TAG, () => {
    alertas.push('iframe removido');
    return '';
  });

  html = html.replace(OBJECT_EMBED_TAG, () => {
    alertas.push('object/embed removido');
    return '';
  });

  html = html.replace(FORM_TAG, () => {
    alertas.push('form removido');
    return '';
  });

  html = html.replace(META_REFRESH, () => {
    alertas.push('meta refresh removido');
    return '';
  });

  html = html.replace(LINK_EXTERNAL, (match) => {
    referenciasExternasRemovidas.push(match);
    return '';
  });

  html = html.replace(EXTERNAL_URL_ATTR, (match, attr, _quote, scheme, rest) => {
    referenciasExternasRemovidas.push(`${scheme}//${rest}`);
    return `${attr}="#"`;
  });

  html = html.replace(JS_URL_ATTR, (match, attr) => `${attr}="#"`);

  html = html.replace(EVENT_HANDLER_ATTR, () => '');

  html = html.replace(HTML_COMMENT, '');

  // Neutraliza o botão de impressão original: sem execução de JS embutido no
  // documento importado. O AirTrust oferece o próprio controle de impressão
  // fora do HTML sanitizado (ver visualizador no frontend).
  html = html.replace(/<button\b[^>]*class="toolbar-print"[^>]*>[\s\S]*?<\/button>/gi, '');

  // Verificados contra o HTML original: uma referência a localhost/file:// no
  // material importado é sinal de artefato de desenvolvimento vazando para o
  // documento publicável, mesmo que a URL já tenha sido neutralizada acima.
  const rawHadLocalhost = new RegExp(LOCALHOST_PATTERN, 'i').test(rawHtml);
  const rawHadFileProtocol = new RegExp(FILE_PROTOCOL_PATTERN, 'i').test(rawHtml);
  if (rawHadLocalhost) {
    alertas.push('referência a localhost encontrada no HTML original');
  }
  if (rawHadFileProtocol) {
    alertas.push('referência a file:// encontrada no HTML original');
  }

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
    scriptsRemovidos,
    referenciasExternasRemovidas,
    alertas,
    aprovado,
  };
}
