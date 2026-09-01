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
   * Tradução pública para fallback de i18n em runtime.
   * Uso principal: traduzir textos residuais hardcoded para EN quando idioma ativo = en-US.
   */
  app.post('/api/public/translate', publicTranslateRateLimit, async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      text?: string;
      from?: string;
      to?: string;
    } | null;

    const rawText = String(body?.text || '').trim();
    const from = String(body?.from || 'pt').toLowerCase();
    const to = String(body?.to || 'en').toLowerCase();

    if (!rawText) {
      return c.json({ success: false, error: 'text is required' }, 400);
    }

    // Limite conservador para evitar abuso/custos inesperados
    if (rawText.length > 500) {
      return c.json({
        success: true,
        data: {
          translatedText: rawText,
          source: from,
          target: to,
          skipped: 'text_too_long',
        },
      });
    }

    if (from === to) {
      return c.json({
        success: true,
        data: {
          translatedText: rawText,
          source: from,
          target: to,
        },
      });
    }

    try {
      const url = new URL('https://translate.googleapis.com/translate_a/single');
      url.searchParams.set('client', 'gtx');
      url.searchParams.set('sl', from || 'auto');
      url.searchParams.set('tl', to || 'en');
      url.searchParams.set('dt', 't');
      url.searchParams.set('q', rawText);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json,text/plain,*/*',
        },
      });

      if (!response.ok) {
        return c.json({
          success: true,
          data: {
            translatedText: rawText,
            source: from,
            target: to,
            fallback: true,
          },
        });
      }

      const payload = (await response.json()) as unknown;

      let translatedText = rawText;
      if (Array.isArray(payload) && Array.isArray(payload[0])) {
        translatedText = (payload[0] as unknown[])
          .map((part) => {
            if (Array.isArray(part) && typeof part[0] === 'string') return part[0];
            return '';
          })
          .join('')
          .trim();
      }

      if (!translatedText) translatedText = rawText;

      return c.json({
        success: true,
        data: {
          translatedText,
          source: from,
          target: to,
        },
      });
    } catch {
      return c.json({
        success: true,
        data: {
          translatedText: rawText,
          source: from,
          target: to,
          fallback: true,
        },
      });
    }
  });
}
