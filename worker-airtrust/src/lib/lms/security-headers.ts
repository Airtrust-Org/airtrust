export const LMS_FRAME_ANCESTORS = [
  "'self'",
  'https://airtrust.online',
  'https://www.airtrust.online',
  'https://*.airtrust.pages.dev',
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
