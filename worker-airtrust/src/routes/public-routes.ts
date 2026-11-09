import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { rateLimiter } from '../middleware/rate-limit';

type PublicApp = Hono<{ Bindings: Env; Variables: Variables }>;

const publicTranslateRateLimit = rateLimiter({
  maxRequests: 20,
  windowSeconds: 60,
  keyPrefix: 'public-translate',
});

/**
 * Registra rotas públicas no app principal.
 * Paths e contratos preservados do index.ts original.
 */
export function registerPublicRoutes(app: PublicApp) {
  /**
   * GET /api/public/locale
   * Detecta país na borda (Cloudflare) para seleção automática de idioma.
   * Regra: BR -> pt-BR | demais países -> en-US
   */
  app.get('/api/public/locale', (c) => {
    const headerCountry = c.req.header('CF-IPCountry');
    const rawCf = c.req.raw.cf as { country?: string } | undefined;
    const country = (headerCountry || rawCf?.country || 'unknown').toUpperCase();
    const language = country === 'BR' ? 'pt-BR' : 'en-US';

    c.header('Cache-Control', 'no-store');
    c.header('Vary', 'Origin');

    return c.json({
      success: true,
      data: {
        country,
        language,
      },
    });
  });

  /**
   * POST /api/public/translate
   * Descontinuado por privacidade: não encaminha dados arbitrários para terceiros.
   * A interface usa exclusivamente o catálogo estático de i18n.
   */
  app.post('/api/public/translate', publicTranslateRateLimit, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      text?: string;
      from?: string;
      to?: string;
    } | null;

    const rawText = String(body?.text || '').trim();

    if (!rawText) {
      return c.json({ success: false, error: 'text is required' }, 400);
    }

    // Fail-closed: this legacy endpoint accepted arbitrary DOM text, including employee data,
    // and forwarded it to a non-contracted third party. All supported UI translations now
    // use a bundled, developer-reviewed catalog; never send request text off-platform.
    return c.json({
      success: false,
      code: 'UNSAFE_DYNAMIC_TRANSLATION_DISABLED',
      error: 'Arbitrary text translation is disabled for privacy. Use the i18n catalog.',
    }, 410);

  });
}
