export const LMS_FRAME_ANCESTORS = [
  "'self'",
  'https://airtrust.online',
  'https://www.airtrust.online',
  // "*.airtrust.pages.dev" only matches subdomains of airtrust.pages.dev — it
  // does NOT match Cloudflare Pages' actual project-name.pages.dev naming
  // (e.g. airtrust-staging.pages.dev is a sibling of, not a child of,
  // airtrust.pages.dev). Both are needed: the wildcard for any legacy/preview
  // subdomains that do follow that pattern, and the explicit staging host so
  // the SCORM player iframe isn't blocked by frame-ancestors in staging.
  'https://*.airtrust.pages.dev',
  'https://airtrust-staging.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].join(' ');

export function buildLmsContentSecurityPolicy(): string {
  return [
    "default-src 'self' blob: data: https: http:",
    `frame-ancestors ${LMS_FRAME_ANCESTORS}`,
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' blob: data: https: http:",
    "style-src 'self' 'unsafe-inline' blob: data: https: http:",
    "img-src 'self' blob: data: https: http:",
    "font-src 'self' blob: data: https: http:",
    "media-src 'self' blob: data: https: http:",
    "connect-src 'self' blob: data: https: http: ws: wss:",
    "worker-src 'self' blob:",
    "form-action 'self'",
  ].join('; ');
}
