type ParseOptions = {
  decode?: (value: string) => string;
};

type SerializeOptions = {
  encode?: (value: string) => string;
  maxAge?: number;
  domain?: string;
  path?: string;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none' | 'Lax' | 'Strict' | 'None';
};

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parse(str: string, options: ParseOptions = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (!str || typeof str !== 'string') return out;

  const decode = options.decode || safeDecode;
  const pairs = str.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const raw = trimmed.slice(eqIdx + 1).trim();
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) continue;
    out[key] = decode(raw);
  }
  return out;
}

export function serialize(name: string, value: string, options: SerializeOptions = {}): string {
  const encode = options.encode || encodeURIComponent;
  let cookie = `${name}=${encode(value)}`;

  if (typeof options.maxAge === 'number') cookie += `; Max-Age=${Math.floor(options.maxAge)}`;
  if (options.domain) cookie += `; Domain=${options.domain}`;
  if (options.path) cookie += `; Path=${options.path}`;
  if (options.expires instanceof Date) cookie += `; Expires=${options.expires.toUTCString()}`;
  if (options.httpOnly) cookie += '; HttpOnly';
  if (options.secure) cookie += '; Secure';
  if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;

  return cookie;
}

export const parseCookie = parse;
export const stringifySetCookie = serialize;

export function stringifyCookie(cookieObj: Record<string, string>): string {
  return Object.entries(cookieObj)
    .map(([key, val]) => `${key}=${encodeURIComponent(String(val))}`)
    .join('; ');
}

export function parseSetCookie(str: string): Record<string, string> {
  const [first = ''] = (str || '').split(';');
  return parse(first);
}

export default {
  parse,
  serialize,
  parseCookie,
  stringifySetCookie,
  stringifyCookie,
  parseSetCookie,
};
