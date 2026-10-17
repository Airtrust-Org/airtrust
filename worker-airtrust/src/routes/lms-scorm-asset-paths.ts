import { ApiError } from '../middleware/error-handler';

export function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'application/javascript',
    mjs: 'application/javascript',
    css: 'text/css',
    xml: 'application/xml',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    swf: 'application/x-shockwave-flash',
    flv: 'video/x-flv',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    ico: 'image/x-icon',
    txt: 'text/plain',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function normalizeR2Path(path: string): string {
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    throw new ApiError('Caminho inválido', 400);
  }

  const normalized = decodedPath.replace(/^\/+/, '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new ApiError('Caminho inválido', 400);
  }

  return segments.join('/');
}

function appendQueryParamPreservingHash(url: string, key: string, value: string): string {
  const hashIndex = url.indexOf('#');
  const base = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex) : '';
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash}`;
}

export function appendCacheBusterToRelativeAssetRefs(html: string, cacheBuster: string): string {
  return html.replace(
    /(\b(?:src|href|poster)=)(["'])([^"']+)(\2)/gi,
    (full, prefix, quote, rawUrl, suffix) => {
      const value = String(rawUrl || '').trim();
      if (!value) return full;
      if (
        value.startsWith('#') ||
        value.startsWith('data:') ||
        value.startsWith('blob:') ||
        value.startsWith('javascript:') ||
        /^[a-z][a-z0-9+.-]*:/i.test(value) ||
        value.startsWith('//')
      ) {
        return full;
      }

      return `${prefix}${quote}${appendQueryParamPreservingHash(value, 'airtrust_scorm', cacheBuster)}${suffix}`;
    },
  );
}
