/**
 * LMS — Serviço de arquivos SCORM e página de lançamento
 *
 * GET /api/lms/scorm/assets/:empresa_id/:curso_id/* → arquivos estáticos do R2
 * GET /api/lms/scorm/launch/:matricula_id           → página HTML completa com scorm-again
 */
import { Hono } from 'hono';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import { ApiError } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { generateJWT, verifyJWT } from '../utils/security';
import { getEmpresaIdOptional } from './escalas-shared';
import type { Env, JwtPayload } from '../types';

const app = new Hono<{ Bindings: Env }>();

const LMS_FRAME_ANCESTORS = [
  "'self'",
  'https://airtrust.online',
  'https://www.airtrust.online',
  'https://*.airtrust.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].join(' ');
const LMS_ASSET_TOKEN_COOKIE = 'airtrust_lms_asset_token';
const LMS_ASSET_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const LMS_PPTX_VIEWER_TOKEN_MAX_AGE_SECONDS = 5 * 60;

function shouldUseSecureAssetCookie(request: Request): boolean {
  const valuesToInspect = [
    request.url,
    request.headers.get('Origin') ?? '',
    request.headers.get('Referer') ?? '',
    request.headers.get('X-Forwarded-Proto') ?? '',
  ];

  const isLocalRequest = valuesToInspect.some((value) =>
    /(^|:\/\/)(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value),
  );

  if (isLocalRequest) {
    return false;
  }

  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return true;
  }
}

function isPrivilegedRole(rawRole: unknown): boolean {
  const role = String(rawRole ?? '')
    .trim()
    .toLowerCase();
  return ['admin', 'administrador', 'manager', 'gestor', 'instrutor', 'instructor'].includes(role);
}

export function parseScormLocationPair(
  location: unknown,
): { current: number; total: number } | null {
  if (typeof location !== 'string' || !location.trim()) return null;

  const trimmed = location.trim();
  let match = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    match = trimmed.match(/(\d+)\s*of\s*(\d+)/i);
  }
  if (!match) return null;

  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current < 0) {
    return null;
  }

  return { current, total };
}

export function resolveScormResumeTargetSlide(
  savedLocation: unknown,
  observedLocation: unknown,
): number | null {
  const saved = parseScormLocationPair(savedLocation);
  if (!saved || saved.current <= 1) return null;

  const observed = parseScormLocationPair(observedLocation);
  if (observed) {
    if (observed.current >= saved.current) return null;
    if (observed.total > 0 && saved.current > observed.total) return null;
  }

  return saved.current;
}

// ── Helpers MIME ──────────────────────────────────────────────────────────────

function guessMime(filename: string): string {
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

function normalizeR2Path(path: string): string {
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

function appendCacheBusterToRelativeAssetRefs(html: string, cacheBuster: string): string {
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

function extractAssetPathFromRequest(pathname: string, routePrefix: string): string {
  const normalizedPrefix = routePrefix.endsWith('/') ? routePrefix : `${routePrefix}/`;
  const prefixIndex = pathname.indexOf(normalizedPrefix);
  if (prefixIndex < 0) {
    return '';
  }

  return normalizeR2Path(pathname.slice(prefixIndex + normalizedPrefix.length));
}

async function resolveScormObject(
  bucket: R2Bucket,
  empresaId: string | number,
  cursoId: string | number,
  wildcard: string,
) {
  const normalizedWildcard = normalizeR2Path(wildcard);
  const prefix = `lms/scorm/${empresaId}/${cursoId}/`;
  const directKey = `${prefix}${normalizedWildcard}`;

  if (!normalizedWildcard) {
    return { object: null, resolvedKey: directKey };
  }

  let object = await bucket.get(directKey);
  if (object && !directKey.endsWith('/')) {
    return { object, resolvedKey: directKey };
  }

  const listed = await bucket.list({ prefix });
  const normalizedKey = directKey.toLowerCase();
  const fallback = listed.objects.find((entry) => {
    const candidate = normalizeR2Path(entry.key).toLowerCase();
    if (!candidate || candidate.endsWith('/')) {
      return false;
    }

    return (
      candidate === normalizedKey || candidate.endsWith(`/${normalizedWildcard.toLowerCase()}`)
    );
  });

  if (!fallback) {
    return { object: null, resolvedKey: directKey };
  }

  object = await bucket.get(fallback.key);
  return { object, resolvedKey: fallback.key };
}

async function resolveScormLaunchFile(
  bucket: R2Bucket,
  empresaId: string | number,
  cursoId: string | number,
  launchFile: string,
): Promise<string | null> {
  const { resolvedKey } = await resolveScormObject(bucket, empresaId, cursoId, launchFile);
  if (!resolvedKey || resolvedKey.endsWith('/')) {
    return null;
  }

  const prefix = `lms/scorm/${empresaId}/${cursoId}/`;
  return resolvedKey.startsWith(prefix) ? resolvedKey.slice(prefix.length) : launchFile;
}

function isPreviewAllowedRole(rawRole: unknown): boolean {
  const role = String(rawRole ?? '')
    .trim()
    .toLowerCase();
  return ['admin', 'administrador', 'manager', 'gestor'].includes(role);
}

function getRequestToken(request: Request): string {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const tokenFromQuery = new URL(request.url).searchParams.get('token')?.trim();
  if (tokenFromQuery) {
    return tokenFromQuery;
  }

  const cookieHeader = request.headers.get('Cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName !== LMS_ASSET_TOKEN_COOKIE) continue;
    const tokenFromCookie = rawValue.join('=').trim();
    if (!tokenFromCookie) break;
    try {
      return decodeURIComponent(tokenFromCookie);
    } catch {
      break;
    }
  }

  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError('Não autenticado', 401);
  }

  return authHeader.slice(7);
}

async function authenticateLmsAssetRequest(env: Env, request: Request) {
  if (!env.JWT_SECRET) {
    throw new ApiError('Configuração do servidor inválida', 500);
  }

  const payload = await verifyJWT(getRequestToken(request), env.JWT_SECRET);
  if (!payload) {
    throw new ApiError('Token inválido ou expirado', 401);
  }

  return payload;
}

function assertPptxViewerAssetToken(payload: JwtPayload, cursoId: number) {
  if (payload.token_type !== 'lms_asset') return;

  if (payload.asset_scope !== 'pptx_viewer' || Number(payload.asset_curso_id ?? 0) !== cursoId) {
    throw new ApiError('Token de visualização PPTX inválido para este curso', 403);
  }
}

function buildAbsoluteLmsAssetUrl(request: Request, path: string) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = '';
  return url.toString();
}

function appendAssetTokenCookie(headers: Headers, token: string, request: Request) {
  const secureDirective = shouldUseSecureAssetCookie(request) ? '; Secure' : '';

  headers.append(
    'Set-Cookie',
    `${LMS_ASSET_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/api/lms/; Max-Age=${LMS_ASSET_TOKEN_MAX_AGE_SECONDS}; SameSite=Lax${secureDirective}`,
  );
}

function buildAssetHeaders(
  corsOrigins: string | undefined,
  origin: string | undefined,
  contentType: string,
  cacheControl = 'no-store, no-cache, must-revalidate, max-age=0',
) {
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin, corsOrigins),
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });

  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');

  return headers;
}

app.post('/assets/session', auth(), async (c) => {
  const token = getRequestToken(c.req.raw);
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(c.req.header('Origin'), c.env.CORS_ORIGINS),
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });
  appendAssetTokenCookie(headers, token, c.req.raw);

  return new Response(JSON.stringify({ success: true, data: { active: true } }), {
    status: 200,
    headers,
  });
});

app.get('/pptx/viewer/:cursoId', async (c) => {
  const db = c.env.DB;
  const payload = (await authenticateLmsAssetRequest(c.env, c.req.raw)) as JwtPayload;
  const cursoId = Number(c.req.param('cursoId'));
  const empresaId = Number(payload.empresa_id ?? 0);

  if (payload.token_type === 'lms_asset') {
    throw new ApiError('Token de visualização não pode emitir outro token de visualização', 403);
  }

  await ensureCourseAssetAccess(db, payload, empresaId, cursoId);

  const secret = c.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError('Configuração do servidor inválida', 500);
  }

  const { token } = await generateJWT(
    {
      sub: Number(payload.sub),
      email: payload.email,
      role: payload.role,
      token_type: 'lms_asset',
      asset_scope: 'pptx_viewer',
      asset_curso_id: cursoId,
      empresa_id: empresaId,
      empresas: payload.empresas,
      permissions: payload.permissions,
      funcionario_id: payload.funcionario_id ?? null,
      nome: payload.nome,
    },
    secret,
    LMS_PPTX_VIEWER_TOKEN_MAX_AGE_SECONDS,
  );

  const assetUrl = `${buildAbsoluteLmsAssetUrl(c.req.raw, `/api/lms/pptx/asset/${cursoId}`)}?token=${encodeURIComponent(token)}`;
  const embedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(assetUrl)}`;
  const openUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(assetUrl)}`;

  return c.json({
    success: true,
    data: {
      assetUrl,
      embedUrl,
      openUrl,
      expiresIn: LMS_PPTX_VIEWER_TOKEN_MAX_AGE_SECONDS,
    },
  });
});

async function ensureCourseAssetAccess(
  db: D1Database,
  payload: JwtPayload,
  empresaId: number,
  cursoId: number,
) {
  const tokenEmpresaId = Number(payload.empresa_id ?? 0);
  if (!tokenEmpresaId || tokenEmpresaId !== empresaId) {
    throw new ApiError('Acesso negado', 403);
  }

  const canManage = isPrivilegedRole(payload.role);
  const callerFuncionarioId = Number(payload.funcionario_id ?? 0);

  const curso = await db
    .prepare(
      `SELECT id, ativo, publicado
         FROM lms_cursos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; ativo: number; publicado: number }>();
  if (!curso) {
    throw new ApiError('Curso não encontrado', 404);
  }

  if (canManage) {
    return curso;
  }

  if (!callerFuncionarioId) {
    throw new ApiError('Acesso negado', 403);
  }

  if (curso.ativo !== 1 || curso.publicado !== 1) {
    throw new ApiError('Curso não disponível', 403);
  }

  const matricula = await db
    .prepare(
      `SELECT id
         FROM lms_matriculas
        WHERE curso_id = ?
          AND empresa_id = ?
          AND funcionario_id = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(cursoId, empresaId, callerFuncionarioId)
    .first<{ id: number }>();
  if (!matricula) {
    throw new ApiError('Acesso negado', 403);
  }

  return curso;
}

async function resolveCursoFromH5p(db: D1Database, h5pId: number) {
  return db
    .prepare(
      `SELECT h.id, h.empresa_id, h.r2_key, c.id AS curso_id, c.ativo, c.publicado
         FROM lms_h5p_conteudos h
         LEFT JOIN lms_cursos c
           ON c.empresa_id = h.empresa_id
          AND c.scorm_package_r2_prefix = h.r2_key
          AND c.tipo_conteudo = 'h5p'
          AND c.deleted_at IS NULL
        WHERE h.id = ?
          AND h.ativo = 1
          AND h.deleted_at IS NULL`,
    )
    .bind(h5pId)
    .first<{
      id: number;
      empresa_id: number;
      r2_key: string;
      curso_id: number | null;
      ativo: number | null;
      publicado: number | null;
    }>();
}

async function ensureH5pAssetAccess(
  db: D1Database,
  payload: JwtPayload,
  h5pId: number,
) {
  const h5p = await resolveCursoFromH5p(db, h5pId);
  if (!h5p) {
    throw new ApiError('Conteúdo H5P não encontrado', 404);
  }

  const tokenEmpresaId = Number(payload.empresa_id ?? 0);
  if (!tokenEmpresaId || tokenEmpresaId !== Number(h5p.empresa_id)) {
    throw new ApiError('Acesso negado', 403);
  }

  if (isPrivilegedRole(payload.role)) {
    return h5p;
  }

  const callerFuncionarioId = Number(payload.funcionario_id ?? 0);
  if (!callerFuncionarioId || !h5p.curso_id || h5p.ativo !== 1 || h5p.publicado !== 1) {
    throw new ApiError('Acesso negado', 403);
  }

  const matricula = await db
    .prepare(
      `SELECT id
         FROM lms_matriculas
        WHERE curso_id = ?
          AND empresa_id = ?
          AND funcionario_id = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(h5p.curso_id, h5p.empresa_id, callerFuncionarioId)
    .first<{ id: number }>();
  if (!matricula) {
    throw new ApiError('Acesso negado', 403);
  }

  return h5p;
}

function buildProtectedLaunchHeaders(
  corsOrigins: string | undefined,
  origin: string | undefined,
): Headers {
  return new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    'Content-Security-Policy': `frame-ancestors ${LMS_FRAME_ANCESTORS}`,
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin, corsOrigins),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma, Expires, X-AirTrust-Bypass-Cache, X-EdApp-Secret',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  });
}

// ── Servir arquivos estáticos SCORM do R2 ─────────────────────────────────────
app.get('/scorm/assets/:empresa_id/:curso_id/*', async (c) => {
  const payload = await authenticateLmsAssetRequest(c.env, c.req.raw);
  const empresaId = c.req.param('empresa_id');
  const cursoId = c.req.param('curso_id');
  const cacheBuster = new URL(c.req.url).searchParams.get('airtrust_scorm')?.trim() || null;
  await ensureCourseAssetAccess(c.env.DB, payload, Number(empresaId), Number(cursoId));
  const wildcard = extractAssetPathFromRequest(
    new URL(c.req.url).pathname,
    `/api/lms/scorm/assets/${empresaId}/${cursoId}`,
  );
  const { object, resolvedKey } = await resolveScormObject(
    c.env.BUCKET,
    empresaId,
    cursoId,
    wildcard,
  );
  if (!object) {
    return c.text('Not found', 404);
  }

  const mime = guessMime(wildcard);
  const headers = buildAssetHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'), mime);

  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('X-LMS-Asset-Key', resolvedKey);

  if (cacheBuster) {
    headers.set('X-AirTrust-SCORM-CacheBuster', cacheBuster);
  }

  if (mime.startsWith('text/html') && cacheBuster) {
    const html = await object.text();
    const rewritten = appendCacheBusterToRelativeAssetRefs(html, cacheBuster);
    return new Response(rewritten, { status: 200, headers });
  }

  return new Response(object.body, { status: 200, headers });
});

// ── Servir arquivos SCORM por cursoId (sem conflito com a rota principal) ────
app.get('/scorm/assets-by-curso/:cursoId/*', async (c) => {
  const db = c.env.DB;
  const payload = await authenticateLmsAssetRequest(c.env, c.req.raw);
  const cursoIdParam = c.req.param('cursoId');
  const wildcard = extractAssetPathFromRequest(
    new URL(c.req.url).pathname,
    `/api/lms/scorm/assets-by-curso/${cursoIdParam}`,
  );

  const curso = await db
    .prepare('SELECT id, empresa_id FROM lms_cursos WHERE id = ? AND deleted_at IS NULL')
    .bind(Number(cursoIdParam))
    .first<{ id: number; empresa_id: number }>();
  if (!curso) return c.text('Not found', 404);
  await ensureCourseAssetAccess(db, payload, curso.empresa_id, curso.id);

  const { object: foundObject, resolvedKey } = await resolveScormObject(
    c.env.BUCKET,
    curso.empresa_id,
    curso.id,
    wildcard,
  );
  const rangeHeader = c.req.header('range');

  let object: R2ObjectBody | null = foundObject;
  let status = 200;
  const headers = buildAssetHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'), guessMime(wildcard));

  if (rangeHeader && object) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const offset = Number(match[1]);
      const endByte = match[2] ? Number(match[2]) : undefined;
      const length = endByte !== undefined ? endByte - offset + 1 : undefined;
      object = await c.env.BUCKET.get(resolvedKey, { range: { offset, length } });
      if (object) {
        const total = object.size;
        const end = endByte ?? total - 1;
        headers.set('Content-Range', `bytes ${offset}-${end}/${total}`);
        headers.set('Accept-Ranges', 'bytes');
        status = 206;
      }
    }
  }

  if (!object) return c.text('Not found', 404);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('X-LMS-Asset-Key', resolvedKey);

  return new Response(object.body, { status, headers });
});

// ── Servir arquivos H5P do R2 ─────────────────────────────────────────────────
app.get('/h5p/assets/:h5pId/*', async (c) => {
  const db = c.env.DB;
  const payload = await authenticateLmsAssetRequest(c.env, c.req.raw);
  const h5pId = Number(c.req.param('h5pId'));
  const wildcard = extractAssetPathFromRequest(
    new URL(c.req.url).pathname,
    `/api/lms/h5p/assets/${h5pId}`,
  );

  const h5p = await ensureH5pAssetAccess(db, payload, h5pId);
  if (!h5p) return c.text('Not found', 404);

  // r2_key é o prefixo do pacote; wildcard é o arquivo dentro do pacote
  const key = wildcard ? `${h5p.r2_key.replace(/\/$/, '')}/${wildcard}` : h5p.r2_key;

  const object = await c.env.BUCKET.get(key);
  if (!object) return c.text('Not found', 404);

  const headers = buildAssetHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'), guessMime(wildcard));
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { status: 200, headers });
});

app.get('/course-assets/:cursoId/thumbnail', async (c) => {
  const db = c.env.DB;
  const cursoId = Number(c.req.param('cursoId'));

  const curso = await db
    .prepare(
      `SELECT id, thumbnail_r2_key
         FROM lms_cursos
        WHERE id = ?
          AND deleted_at IS NULL`,
    )
    .bind(cursoId)
    .first<{ id: number; thumbnail_r2_key: string | null }>();

  if (!curso?.thumbnail_r2_key) {
    return c.text('Not found', 404);
  }

  const object = await c.env.BUCKET.get(curso.thumbnail_r2_key);
  if (!object) {
    return c.text('Not found', 404);
  }

  const headers = new Headers({
    'Content-Type': guessMime(curso.thumbnail_r2_key),
    'Cache-Control': 'public, max-age=86400',
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });

  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { status: 200, headers });
});

// ── Página de lançamento SCORM ────────────────────────────────────────────────
// Requer Authorization: Bearer e devolve HTML pronto para ser carregado via fetch autenticado.

app.get('/scorm/launch/:matricula_id', async (c) => {
  const rawToken = getRequestToken(c.req.raw);

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    return new Response('Configuração do servidor inválida', { status: 500 });
  }

  const payload = await verifyJWT(rawToken, jwtSecret);
  if (!payload) {
    return new Response('Token inválido ou expirado', { status: 401 });
  }

  const empresaId = getEmpresaIdOptional(c) || Number(payload.empresa_id ?? 0);
  if (!empresaId) {
    return new Response('Empresa não identificada no token', { status: 401 });
  }

  const db = c.env.DB;
  const matriculaId = Number(c.req.param('matricula_id'));

  const matricula = await db
    .prepare(
      `
      SELECT m.id, m.funcionario_id, m.empresa_id, m.status,
        c.id AS curso_id, c.titulo, c.scorm_versao,
        c.scorm_package_r2_prefix, c.scorm_launch_file, c.ativo, c.publicado
      FROM lms_matriculas m
      JOIN lms_cursos c ON c.id = m.curso_id
      WHERE m.id = ? AND m.empresa_id = ? AND m.deleted_at IS NULL
    `,
    )
    .bind(matriculaId, empresaId)
    .first<{
      id: number;
      funcionario_id: number;
      empresa_id: number;
      status: string;
      curso_id: number;
      titulo: string;
      scorm_versao: string | null;
      scorm_package_r2_prefix: string | null;
      scorm_launch_file: string | null;
      ativo: number;
      publicado: number;
    }>();

  if (!matricula) throw new ApiError('Matrícula não encontrada', 404);
  const callerFuncionarioId =
    typeof payload.funcionario_id === 'number' && payload.funcionario_id > 0
      ? payload.funcionario_id
      : null;
  const canManage = isPrivilegedRole(payload.role);
  if (!canManage) {
    if (!callerFuncionarioId || callerFuncionarioId !== matricula.funcionario_id) {
      throw new ApiError('Acesso negado', 403);
    }
    if (matricula.ativo !== 1 || matricula.publicado !== 1 || matricula.status === 'CANCELADO') {
      throw new ApiError('Curso não disponível para este usuário', 403);
    }
  }
  if (!matricula.scorm_launch_file)
    throw new ApiError('Este curso não tem conteúdo SCORM configurado', 400);

  const resolvedLaunchFile = await resolveScormLaunchFile(
    c.env.BUCKET,
    matricula.empresa_id,
    matricula.curso_id,
    matricula.scorm_launch_file,
  );
  if (!resolvedLaunchFile) {
    throw new ApiError('Arquivo inicial do pacote SCORM não foi encontrado no storage', 404);
  }

  const launchUrl = `/api/lms/scorm/assets/${matricula.empresa_id}/${matricula.curso_id}/${resolvedLaunchFile}`;
  const commitUrl = '/api/lms/matriculas/scorm/commit';

  // Versão SCORM: 1.2 ou 2004
  const isScorm2004 = matricula.scorm_versao === '2004';
  const progressoScorm = await db
    .prepare(
      `SELECT suspend_data, cmi_json
         FROM lms_progresso_scorm
        WHERE matricula_id = ?
          AND empresa_id = ?`,
    )
    .bind(matricula.id, empresaId)
    .first<{ suspend_data: string | null; cmi_json: string | null }>();

  const { initialCmiJson, hasResumeState } = buildScormLaunchState(
    progressoScorm?.cmi_json ?? null,
    progressoScorm?.suspend_data ?? null,
    isScorm2004,
  );

  const html = buildLaunchPage({
    matriculaId: matricula.id,
    titulo: matricula.titulo,
    launchUrl,
    commitUrl,
    token: rawToken,
    isScorm2004,
    initialCmiJson,
    hasResumeState,
    assetCacheBuster: Date.now().toString(36),
  });

  const headers = buildProtectedLaunchHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'));
  appendAssetTokenCookie(headers, rawToken, c.req.raw);

  return new Response(html, {
    status: 200,
    headers,
  });
});

// ── Pré-visualização SCORM para admin/gestor (sem matrícula) ────────────────

app.get('/scorm/preview/:curso_id', async (c) => {
  const rawToken = getRequestToken(c.req.raw);

  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    return new Response('Configuração do servidor inválida', { status: 500 });
  }

  const payload = await verifyJWT(rawToken, jwtSecret);
  if (!payload) {
    return new Response('Token inválido ou expirado', { status: 401 });
  }

  if (!isPreviewAllowedRole(payload.role)) {
    return new Response('Acesso negado', { status: 403 });
  }

  const empresaId = getEmpresaIdOptional(c) || Number(payload.empresa_id ?? 0);
  const cursoId = Number(c.req.param('curso_id'));
  const db = c.env.DB;

  const curso = await db
    .prepare(
      `
      SELECT id, empresa_id, titulo, scorm_versao, scorm_launch_file
      FROM lms_cursos
      WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL
    `,
    )
    .bind(cursoId, empresaId)
    .first<{
      id: number;
      empresa_id: number;
      titulo: string;
      scorm_versao: string | null;
      scorm_launch_file: string | null;
    }>();

  if (!curso) throw new ApiError('Curso não encontrado', 404);
  if (!curso.scorm_launch_file)
    throw new ApiError('Este curso não tem conteúdo SCORM configurado', 400);

  const resolvedLaunchFile = await resolveScormLaunchFile(
    c.env.BUCKET,
    curso.empresa_id,
    curso.id,
    curso.scorm_launch_file,
  );
  if (!resolvedLaunchFile) {
    throw new ApiError('Arquivo inicial do pacote SCORM não foi encontrado no storage', 404);
  }

  const launchUrl = `/api/lms/scorm/assets/${curso.empresa_id}/${curso.id}/${resolvedLaunchFile}`;
  const isScorm2004 = curso.scorm_versao === '2004';

  const html = buildLaunchPage({
    matriculaId: null,
    titulo: `${curso.titulo} · Pré-visualização`,
    launchUrl,
    commitUrl: null,
    token: rawToken,
    isScorm2004,
    previewMode: true,
    assetCacheBuster: Date.now().toString(36),
  });

  const headers = buildProtectedLaunchHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'));
  appendAssetTokenCookie(headers, rawToken, c.req.raw);

  return new Response(html, {
    status: 200,
    headers,
  });
});

// ── Builder da página HTML ────────────────────────────────────────────────────

interface LaunchPageConfig {
  matriculaId: number | null;
  titulo: string;
  launchUrl: string;
  commitUrl: string | null;
  token: string;
  isScorm2004: boolean;
  initialCmiJson?: string;
  hasResumeState?: boolean;
  previewMode?: boolean;
  assetCacheBuster?: string;
}

function buildScormLaunchState(
  rawCmiJson: string | null,
  suspendData: string | null,
  isScorm2004: boolean,
): { initialCmiJson: string; hasResumeState: boolean } {
  let cmi: Record<string, unknown> = {};

  if (rawCmiJson) {
    try {
      const parsed = JSON.parse(rawCmiJson) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        cmi = parsed;
      }
    } catch {
      cmi = {};
    }
  }

  if (suspendData && !cmi['cmi.suspend_data']) {
    cmi['cmi.suspend_data'] = suspendData;
  }

  const hasResumeState = Boolean(
    cmi['cmi.suspend_data'] || cmi['cmi.location'] || cmi['cmi.core.lesson_location'],
  );

  if (hasResumeState) {
    if (isScorm2004) {
      cmi['cmi.entry'] = 'resume';
    } else {
      cmi['cmi.core.entry'] = 'resume';
    }
  }

  return {
    initialCmiJson: JSON.stringify(cmi),
    hasResumeState,
  };
}

function buildLaunchPage(cfg: LaunchPageConfig): string {
  const {
    matriculaId,
    titulo,
    launchUrl,
    commitUrl,
    token,
    isScorm2004,
    initialCmiJson = '{}',
    hasResumeState = false,
    previewMode,
    assetCacheBuster,
  } = cfg;

  const launchUrlWithCacheBuster = assetCacheBuster
    ? `${launchUrl}${launchUrl.includes('?') ? '&' : '?'}airtrust_scorm=${encodeURIComponent(assetCacheBuster)}`
    : launchUrl;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(titulo)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #0a0a0a; overflow: hidden; }
  #scorm-frame { width: 100%; height: 100%; border: none; display: block; }
  #status-bar {
    position: fixed; bottom: 0; left: 0; right: 0; height: 32px;
    background: rgba(0,0,0,0.8); color: #a3a3a3; font: 12px/32px system-ui;
    padding: 0 16px; display: flex; align-items: center; gap: 12px;
    z-index: 9999; pointer-events: none;
  }
  #status-dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
  #status-dot.active { background: #22c55e; }
  #completion-overlay {
    display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    z-index: 99999; align-items: center; justify-content: center; flex-direction: column; gap: 16px;
    color: #fff; font-family: system-ui;
  }
  #completion-overlay.show { display: flex; }
  #completion-overlay h2 { font-size: 24px; font-weight: 600; }
  #completion-overlay p { color: #a3a3a3; font-size: 14px; }
  #btn-close {
    margin-top: 8px; padding: 10px 24px; background: #2563eb; color: #fff;
    border: none; border-radius: 8px; font-size: 15px; cursor: pointer;
  }
</style>
</head>
<body>
<script>
/* Stub SCORM API antes do iframe para evitar SecurityError cross-origin em browsers com cache */
(function() {
  var stub12 = {
    LMSInitialize: function() { return 'true'; },
    LMSFinish: function() { return 'true'; },
    LMSGetValue: function() { return ''; },
    LMSSetValue: function() { return 'true'; },
    LMSCommit: function() { return 'true'; },
    LMSGetLastError: function() { return '0'; },
    LMSGetErrorString: function() { return 'No error'; },
    LMSGetDiagnostic: function() { return ''; }
  };
  var stub2004 = {
    Initialize: function() { return 'true'; },
    Terminate: function() { return 'true'; },
    GetValue: function() { return ''; },
    SetValue: function() { return 'true'; },
    Commit: function() { return 'true'; },
    GetLastError: function() { return '0'; },
    GetErrorString: function() { return 'No error'; },
    GetDiagnostic: function() { return ''; }
  };
  window.API = stub12;
  window.API_1484_11 = stub2004;
})();
</script>
<iframe id="scorm-frame" src="${escapeHtml(launchUrlWithCacheBuster)}" allow="autoplay; fullscreen" sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"></iframe>
<div id="status-bar">
  <span id="status-dot"></span>
  <span id="status-text">Carregando SCORM...</span>
</div>
<div id="completion-overlay">
  <h2>${previewMode ? 'Pré-visualização finalizada' : '✓ Concluído!'}</h2>
  <p>${previewMode ? 'O conteúdo foi carregado e executado em modo de teste.' : 'Seu progresso foi salvo com sucesso.'}</p>
  <button id="btn-close" onclick="${previewMode ? '' : `window.parent.postMessage({type:'lms:completed',matriculaId:${matriculaId ?? 0}}, '*'); `}window.history.back()">
    Fechar
  </button>
</div>

<script>
${parseScormLocationPair.toString()}
${resolveScormResumeTargetSlide.toString()}

(function() {
  'use strict';
  var PARENT_ORIGIN = (function() {
    try {
      return document.referrer ? new URL(document.referrer).origin : '*';
    } catch (_error) {
      return '*';
    }
  })();
  var MATRICULA_ID = ${matriculaId === null ? 'null' : matriculaId};
  var COMMIT_URL = ${commitUrl ? `'${commitUrl}'` : 'null'};
  var TOKEN = '${escapeHtml(token)}';
  var IS_2004 = ${isScorm2004 ? 'true' : 'false'};
  var PREVIEW_MODE = ${previewMode ? 'true' : 'false'};
  var cmi = (function() {
    try {
      var parsed = JSON.parse(${JSON.stringify(initialCmiJson)});
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      return {};
    }
  })();
  var completed = false;
  var maxVisitedSlide = 0;
  var tokenResolvers = [];
  var tokenRequestId = 0;
  var autosaveTimer = null;
  var interactionProbeTimer = null;
  var lastCommittedFingerprint = '';

  if (${hasResumeState ? 'true' : 'false'}) {
    if (IS_2004) {
      if (!cmi['cmi.entry']) cmi['cmi.entry'] = 'resume';
    } else {
      if (!cmi['cmi.core.entry']) cmi['cmi.core.entry'] = 'resume';
    }
  }

  function postToParent(message) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage(message, PARENT_ORIGIN === 'null' ? '*' : PARENT_ORIGIN);
  }

  function resolvePendingToken(tokenValue) {
    while (tokenResolvers.length > 0) {
      var resolve = tokenResolvers.shift();
      if (typeof resolve === 'function') resolve(tokenValue);
    }
  }

  function updateToken(tokenValue) {
    if (!tokenValue || typeof tokenValue !== 'string') return;
    TOKEN = tokenValue;
    resolvePendingToken(tokenValue);
  }

  function requestFreshToken(reason) {
    if (PREVIEW_MODE) return;
    tokenRequestId += 1;
    postToParent({
      type: 'lms:auth-token-request',
      matriculaId: MATRICULA_ID,
      previewMode: PREVIEW_MODE,
      reason: reason || 'sync',
      requestId: tokenRequestId,
    });
  }

  function getFreshToken(reason) {
    if (PREVIEW_MODE) return Promise.resolve(TOKEN || null);
    if (TOKEN) {
      requestFreshToken(reason || 'heartbeat');
      return Promise.resolve(TOKEN);
    }

    requestFreshToken(reason || 'missing');
    return new Promise(function(resolve) {
      tokenResolvers.push(resolve);
      window.setTimeout(function() {
        resolve(TOKEN || null);
      }, 1500);
    });
  }

  function setStatus(text, active) {
    var dot = document.getElementById('status-dot');
    var txt = document.getElementById('status-text');
    if (dot) dot.className = active ? 'active' : '';
    if (txt) txt.textContent = text;
  }

  function isoToTimespan(iso) {
    if (!iso) return '0000:00:00.00';
    return iso;
  }

  function getScormLocation() {
    return cmi['cmi.location'] || cmi['cmi.core.lesson_location'] || null;
  }

  function fingerprintPayload(data) {
    try {
      return JSON.stringify(data || {});
    } catch (_error) {
      return '';
    }
  }

  function parseLocationPair(location) {
    return parseScormLocationPair(location);
  }

  function updateMaxVisitedFromLocation(location) {
    var parsed = parseLocationPair(location);
    if (!parsed) return;
    if (parsed.current > maxVisitedSlide) {
      maxVisitedSlide = parsed.current;
    }
  }

  function emitProgress(payload) {
    if (MATRICULA_ID == null) return;
    postToParent(Object.assign({
      type: 'lms:progress',
      matriculaId: MATRICULA_ID,
      location: getScormLocation(),
    }, payload || {}));
  }

  function parseProgressFromText(text) {
    if (!text) return null;
    var regex = /(\\d+)\\s*\\/\\s*(\\d+)/g;
    var match;
    var best = null;
    while ((match = regex.exec(text)) !== null) {
      var current = Number(match[1]);
      var total = Number(match[2]);
      if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 1 || current < 0 || current > total) {
        continue;
      }
      var pct = Math.max(0, Math.min(100, Math.round((current / total) * 100)));
      if (!best || total > best.total) {
        best = { current: current, total: total, pct: pct };
      }
    }

    if (best) return best;

    var ofRegex = /(\\d+)\\s*of\\s*(\\d+)/gi;
    while ((match = ofRegex.exec(text)) !== null) {
      var ofCurrent = Number(match[1]);
      var ofTotal = Number(match[2]);
      if (!Number.isFinite(ofCurrent) || !Number.isFinite(ofTotal) || ofTotal <= 1 || ofCurrent < 0 || ofCurrent > ofTotal) {
        continue;
      }
      var ofPct = Math.max(0, Math.min(100, Math.round((ofCurrent / ofTotal) * 100)));
      if (!best || ofTotal > best.total) {
        best = { current: ofCurrent, total: ofTotal, pct: ofPct };
      }
    }

    return best;
  }

  function parseProgressFromHeader(doc) {
    if (!doc) return null;

    var currentNode = doc.querySelector('#lesson-header-nav-page-number');
    var currentText = currentNode ? String(currentNode.textContent || '') : '';
    var currentMatch = currentText.match(/\\d+/);
    var current = currentMatch ? Number(currentMatch[0]) : NaN;

    var total = NaN;
    var menuCount = doc.querySelector('#lesson-menu-page-count');
    if (menuCount) {
      total = Number(menuCount.getAttribute('data-total') || '');
    }

    if (!Number.isFinite(total) || total <= 1) {
      var headerCount = doc.querySelector('#lesson-header-nav-page-count');
      var headerText = headerCount ? String(headerCount.textContent || '') : '';
      var slash = headerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
      if (slash) {
        if (!Number.isFinite(current)) current = Number(slash[1]);
        total = Number(slash[2]);
      }

      if (!Number.isFinite(total) || total <= 1) {
        var compactOf = headerText.match(/(\\d+)\\s*of\\s*(\\d+)/i);
        if (compactOf) {
          if (!Number.isFinite(current)) current = Number(compactOf[1]);
          total = Number(compactOf[2]);
        }
      }
    }

    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 1) return null;
    if (current < 0 || current > total) return null;

    return {
      current: current,
      total: total,
      pct: Math.max(0, Math.min(100, Math.round((current / total) * 100))),
    };
  }

  function parseProgressFromDocument(doc) {
    var fromHeader = parseProgressFromHeader(doc);
    if (fromHeader) return fromHeader;
    var text = (doc && doc.body && doc.body.innerText) ? doc.body.innerText : '';
    return parseProgressFromText(text);
  }

  function navigateFrameToSlide(frameWindow, target) {
    try {
      if (!Number.isFinite(target) || target < 1) return false;

      if (
        frameWindow.Application &&
        frameWindow.Application.router &&
        typeof frameWindow.Application.router.doNavigate === 'function'
      ) {
        frameWindow.Application.router.doNavigate('slide/' + String(target));
        return true;
      }

      if (frameWindow.location) {
        var targetHash = '#slide/' + String(target);
        if (frameWindow.location.hash !== targetHash) {
          frameWindow.location.hash = targetHash;
        } else if (typeof frameWindow.location.assign === 'function') {
          frameWindow.location.assign(targetHash);
        }
        return true;
      }
    } catch (_error) {
      return false;
    }

    return false;
  }

  function restoreResumeLocation(remainingAttempts) {
    try {
      var savedLocation = getScormLocation();
      var target = resolveScormResumeTargetSlide(savedLocation, null);
      if (!target) return;

      var frame = document.getElementById('scorm-frame');
      if (!frame || !frame.contentWindow || !frame.contentWindow.document) {
        if (remainingAttempts > 0) {
          window.setTimeout(function() {
            restoreResumeLocation(remainingAttempts - 1);
          }, 250);
        }
        return;
      }

      var frameWindow = frame.contentWindow;
      var doc = frameWindow.document;
      var parsed = parseProgressFromDocument(doc);
      var observedLocation = parsed ? String(parsed.current) + '/' + String(parsed.total) : null;
      var effectiveTarget = resolveScormResumeTargetSlide(savedLocation, observedLocation);
      if (!effectiveTarget) return;

      var moved = navigateFrameToSlide(frameWindow, effectiveTarget);
      if (moved) {
        window.setTimeout(function() {
          probeFrameProgress();
        }, 120);
      }

      if (remainingAttempts > 0) {
        window.setTimeout(function() {
          restoreResumeLocation(remainingAttempts - 1);
        }, 250);
      }
    } catch (_error) {
      if (remainingAttempts > 0) {
        window.setTimeout(function() {
          restoreResumeLocation(remainingAttempts - 1);
        }, 250);
      }
    }
  }

  function scheduleInteractionProbe(delayMs, remainingAttempts) {
    if (interactionProbeTimer) {
      window.clearTimeout(interactionProbeTimer);
    }

    interactionProbeTimer = window.setTimeout(function() {
      interactionProbeTimer = null;
      probeFrameProgress();
      if ((remainingAttempts || 0) > 0) {
        scheduleInteractionProbe(250, (remainingAttempts || 0) - 1);
      }
    }, typeof delayMs === 'number' ? delayMs : 120);
  }

  function bindFrameProgressTracking() {
    try {
      var frame = document.getElementById('scorm-frame');
      if (!frame || !frame.contentWindow || !frame.contentWindow.document) return;
      var frameWindow = frame.contentWindow;
      var doc = frameWindow.document;
      if (frameWindow.__airtrustProgressTrackingBound) return;

      frameWindow.__airtrustProgressTrackingBound = true;

      var triggerProbe = function() {
        scheduleInteractionProbe(120, 2);
      };

      if (typeof frameWindow.addEventListener === 'function') {
        frameWindow.addEventListener('hashchange', triggerProbe);
        frameWindow.addEventListener('popstate', triggerProbe);
      }

      if (doc && typeof doc.addEventListener === 'function') {
        doc.addEventListener('click', triggerProbe, true);
        doc.addEventListener('keyup', triggerProbe, true);
        doc.addEventListener('change', triggerProbe, true);
      }
    } catch (_error) {
      // Alguns pacotes podem bloquear eventos específicos; o polling continua como fallback.
    }
  }

  function probeFrameProgress() {
    try {
      var frame = document.getElementById('scorm-frame');
      if (!frame || !frame.contentWindow || !frame.contentWindow.document) return;
      var doc = frame.contentWindow.document;
      var parsed = parseProgressFromDocument(doc);
      if (!parsed) return;

      var existingLocation = getScormLocation();
      var previousLocation = existingLocation;
      var existingParsed = parseLocationPair(existingLocation);
      var effectiveCurrent = parsed.current;
      var effectiveTotal = parsed.total;

      // Nunca deixe a leitura inicial do DOM regredir um marcador já salvo.
      if (
        existingParsed &&
        existingParsed.total > 0 &&
        parsed.total > 0 &&
        existingParsed.total === parsed.total &&
        existingParsed.current > parsed.current
      ) {
        effectiveCurrent = existingParsed.current;
        effectiveTotal = existingParsed.total;
      }

      var location = String(effectiveCurrent) + '/' + String(effectiveTotal);
      if (!cmi['cmi.location']) cmi['cmi.location'] = location;
      if (!cmi['cmi.core.lesson_location']) cmi['cmi.core.lesson_location'] = location;

      if (cmi['cmi.location'] !== location || cmi['cmi.core.lesson_location'] !== location) {
        cmi['cmi.location'] = location;
        cmi['cmi.core.lesson_location'] = location;
      }

      var shouldCommitLocation = previousLocation !== location;
      updateMaxVisitedFromLocation(location);
      emitProgress({
        progresso_pct: Math.max(parsed.pct, Math.round((effectiveCurrent / effectiveTotal) * 100)),
        location: location,
        slide_current: effectiveCurrent,
        slide_total: effectiveTotal,
        reached_end: effectiveCurrent >= effectiveTotal,
      });
      if (shouldCommitLocation) {
        scheduleCommit(800);
      }
    } catch (_error) {
      // Alguns pacotes podem bloquear leitura do DOM do frame.
    }
  }

  function commit(data, attempt) {
    if (PREVIEW_MODE || !COMMIT_URL || MATRICULA_ID == null) return Promise.resolve();
    var payloadFingerprint = fingerprintPayload(data);
    return getFreshToken('commit').then(function(freshToken) {
      if (!freshToken) return null;
      return fetch(COMMIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + freshToken,
        },
        body: JSON.stringify(Object.assign({ matricula_id: MATRICULA_ID }, data)),
        keepalive: true,
      });
    }).then(function(response) {
      if (response && response.status === 401 && (attempt || 0) < 1) {
        TOKEN = '';
        requestFreshToken('retry-after-401');
        return commit(data, (attempt || 0) + 1);
      }

      if (response && response.ok) {
        setStatus('Progresso salvo', true);
        if (payloadFingerprint) lastCommittedFingerprint = payloadFingerprint;
        response.clone().json().then(function(json) {
          if (!json || !json.success || !json.data) return;
          emitProgress({
            progresso_pct: Number(json.data.progresso_pct || 0),
            novo_status: json.data.novo_status || null,
          });
          if (json.data.novo_status === 'CONCLUIDO') {
            completed = true;
            var _ov2 = document.getElementById('completion-overlay');
            if (_ov2) _ov2.classList.add('show');
            postToParent({ type: 'lms:completed', matriculaId: MATRICULA_ID });
          }
        }).catch(function() { return null; });
      } else if (response) {
        setStatus('Falha ao salvar progresso. Tentando novamente...', true);
        if ((attempt || 0) < 2) {
          window.setTimeout(function() {
            commit(data, (attempt || 0) + 1);
          }, 1200);
        }
      }

      return response;
    }).catch(function(e) {
      console.warn('[SCORM] commit error', e);
      setStatus('Falha ao salvar progresso. Tentando novamente...', true);
      if ((attempt || 0) < 2) {
        window.setTimeout(function() {
          commit(data, (attempt || 0) + 1);
        }, 1200);
      }
      return null;
    });
  }

  function scheduleCommit(delayMs) {
    if (PREVIEW_MODE || MATRICULA_ID == null) return;
    if (autosaveTimer) {
      window.clearTimeout(autosaveTimer);
    }

    autosaveTimer = window.setTimeout(function() {
      autosaveTimer = null;
      var payload = buildPayload();
      var payloadFingerprint = fingerprintPayload(payload);
      if (!payloadFingerprint || payloadFingerprint === lastCommittedFingerprint) return;
      commit(payload);
    }, typeof delayMs === 'number' ? delayMs : 1500);
  }

  function buildPayload() {
    if (IS_2004) {
      return {
        completion_status: cmi['cmi.completion_status'] || null,
        success_status: cmi['cmi.success_status'] || null,
        score_raw: parseFloat(cmi['cmi.score.raw']) || null,
        score_max: parseFloat(cmi['cmi.score.max']) || null,
        score_min: parseFloat(cmi['cmi.score.min']) || null,
        score_scaled: parseFloat(cmi['cmi.score.scaled']) || null,
        session_time: cmi['cmi.session_time'] || null,
        total_time: cmi['cmi.total_time'] || null,
        suspend_data: cmi['cmi.suspend_data'] || null,
        launch_data: cmi['cmi.launch_data'] || null,
        cmi_json: JSON.stringify(cmi),
      };
    }
    return {
      lesson_status: cmi['cmi.core.lesson_status'] || null,
      score_raw: parseFloat(cmi['cmi.core.score.raw']) || null,
      score_max: parseFloat(cmi['cmi.core.score.max']) || null,
      score_min: parseFloat(cmi['cmi.core.score.min']) || null,
      session_time: cmi['cmi.core.session_time'] || null,
      total_time: cmi['cmi.core.total_time'] || null,
      suspend_data: cmi['cmi.suspend_data'] || null,
      launch_data: cmi['cmi.launch_data'] || null,
      cmi_json: JSON.stringify(cmi),
    };
  }

  function checkCompletion() {
    if (completed) return;
    var ls = cmi['cmi.core.lesson_status'] || '';
    var cs = cmi['cmi.completion_status'] || '';
    var ss = cmi['cmi.success_status'] || '';
    if (
      ls === 'passed' ||
      ls === 'completed' ||
      cs === 'completed' ||
      (ss === 'passed' && cs !== 'incomplete')
    ) {
      completed = true;
      var _ov = document.getElementById('completion-overlay');
      if (_ov) _ov.classList.add('show');
      if (MATRICULA_ID != null) {
        window.parent.postMessage({ type: 'lms:completed', matriculaId: MATRICULA_ID }, '*');
      }
    }
  }

  function dispatchIostap(node) {
    try {
      var custom = new CustomEvent('iostap', { bubbles: true, cancelable: true });
      node.dispatchEvent(custom);
      return true;
    } catch (_error) {
      try {
        var legacy = document.createEvent('Event');
        legacy.initEvent('iostap', true, true);
        node.dispatchEvent(legacy);
        return true;
      } catch (_legacyError) {
        return false;
      }
    }
  }

  function clickNode(node) {
    if (!node) return false;
    dispatchIostap(node);
    if (typeof node.click === 'function') {
      node.click();
      return true;
    }
    return false;
  }

  function clickFirst(doc, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var el = doc.querySelector(selectors[i]);
      if (el && clickNode(el)) {
        return true;
      }
    }
    return false;
  }

  function clickByText(doc, direction) {
    var words =
      direction === 'prev'
        ? ['anterior', 'voltar', 'previous', 'prev', 'back']
        : ['proximo', 'próximo', 'next', 'continuar', 'avancar', 'avançar', 'finalizar', 'done'];

    var candidates = doc.querySelectorAll('button, [role="button"], a, .btn');
    for (var i = 0; i < candidates.length; i += 1) {
      var node = candidates[i];
      var text = String(node.textContent || '').trim().toLowerCase();
      var aria = String(node.getAttribute('aria-label') || '').trim().toLowerCase();
      var title = String(node.getAttribute('title') || '').trim().toLowerCase();
      var hay = text + ' ' + aria + ' ' + title;
      for (var j = 0; j < words.length; j += 1) {
        if (hay.indexOf(words[j]) !== -1) {
          if (clickNode(node)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function navigateByRouter(frameWindow, doc, direction) {
    try {
      var parsed = parseProgressFromDocument(doc);
      if (!parsed) return false;

      var target = direction === 'prev' ? parsed.current - 1 : parsed.current + 1;
      if (!Number.isFinite(target) || target < 1 || target > parsed.total) return false;
      return navigateFrameToSlide(frameWindow, target);
    } catch (_error) {
      return false;
    }

    return false;
  }

  function navigateSlide(direction) {
    try {
      var frame = document.getElementById('scorm-frame');
      if (!frame || !frame.contentWindow || !frame.contentWindow.document) return false;
      var frameWindow = frame.contentWindow;
      var doc = frameWindow.document;
      var parsed = parseProgressFromDocument(doc);
      if (!parsed) return false;

      var current = parsed.current;
      var total = parsed.total;
      var target = direction === 'prev' ? current - 1 : current + 1;
      if (!Number.isFinite(target) || target < 1 || target > total) return false;

      if (maxVisitedSlide < current) {
        maxVisitedSlide = current;
      }

      if (direction === 'next' && target > maxVisitedSlide) {
        return false;
      }

      var prevSelectors = [
        '[data-action="prev"]',
        '[data-action="previous"]',
        '.btn-prev',
        '.prev',
        '#prev',
        '#lesson-menu-go-back',
        '[aria-label*="Anterior"]',
        '[aria-label*="Voltar"]',
        '[aria-label*="Previous"]',
      ];

      var nextSelectors = [
        '[data-action="next"]',
        '.btn-next',
        '.next',
        '#next',
        '#slide-answer-continue',
        '#done-btn',
        '#prompt-btn',
        '.btn-done',
        '.exit-btn',
        '[aria-label*="Próximo"]',
        '[aria-label*="Proximo"]',
        '[aria-label*="Next"]',
      ];

      var moved = direction === 'prev'
        ? navigateByRouter(frameWindow, doc, 'prev') || clickFirst(doc, prevSelectors) || clickByText(doc, 'prev')
        : navigateByRouter(frameWindow, doc, 'next') || clickFirst(doc, nextSelectors) || clickByText(doc, 'next');

      if (moved) {
        scheduleCommit(1200);
        window.setTimeout(function() {
          probeFrameProgress();
        }, 120);
      }

      return moved;
    } catch (_error) {
      return false;
    }
  }

  function toggleEmbeddedFullscreen() {
    var doc = document;
    var root = document.documentElement;
    var isFullscreen = doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement;

    if (isFullscreen) {
      if (doc.exitFullscreen) {
        doc.exitFullscreen().catch(function() { return undefined; });
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
      return;
    }

    if (root.requestFullscreen) {
      root.requestFullscreen().catch(function() { return undefined; });
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    } else if (root.msRequestFullscreen) {
      root.msRequestFullscreen();
    }
  }

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (PARENT_ORIGIN !== '*' && event.origin !== PARENT_ORIGIN) return;
    if (event.data.type === 'lms:auth-token' && (event.data.previewMode === PREVIEW_MODE)) {
      updateToken(event.data.token || '');
      return;
    }
    if (event.data.type === 'lms:navigate' && (event.data.direction === 'prev' || event.data.direction === 'next')) {
      var moved = navigateSlide(event.data.direction);
      if (MATRICULA_ID != null) {
        postToParent({
          type: 'lms:navigate:ack',
          matriculaId: MATRICULA_ID,
          direction: event.data.direction,
          moved: moved,
          location: getScormLocation(),
        });
      }
      return;
    }

    if (event.data.type === 'lms:fullscreen') {
      toggleEmbeddedFullscreen();
    }
  });

  // ── SCORM 1.2 API ───────────────────────────────────────────────────────────
  var SCORM12 = {
    LMSInitialize: function() {
      setStatus('SCORM inicializado', true);
      return 'true';
    },
    LMSFinish: function() {
      commit(buildPayload());
      setStatus('Sessão encerrada', false);
      return 'true';
    },
    LMSGetValue: function(element) {
      return cmi[element] !== undefined ? String(cmi[element]) : '';
    },
    LMSSetValue: function(element, value) {
      cmi[element] = value;
      if (element === 'cmi.core.lesson_status') checkCompletion();
      if (element === 'cmi.core.lesson_location' || element === 'cmi.suspend_data') {
        if (element === 'cmi.core.lesson_location') {
          cmi['cmi.location'] = String(value || '');
          updateMaxVisitedFromLocation(cmi['cmi.location']);
        }
        emitProgress({ location: getScormLocation() });
        scheduleCommit(800);
      }
      setStatus('Atualizando: ' + element, true);
      return 'true';
    },
    LMSCommit: function() {
      commit(buildPayload());
      return 'true';
    },
    LMSGetLastError: function() { return '0'; },
    LMSGetErrorString: function() { return 'No error'; },
    LMSGetDiagnostic: function() { return ''; },
  };

  // ── SCORM 2004 API ──────────────────────────────────────────────────────────
  var SCORM2004 = {
    Initialize: function() {
      setStatus('SCORM 2004 inicializado', true);
      return 'true';
    },
    Terminate: function() {
      commit(buildPayload());
      setStatus('Sessão encerrada', false);
      return 'true';
    },
    GetValue: function(element) {
      return cmi[element] !== undefined ? String(cmi[element]) : '';
    },
    SetValue: function(element, value) {
      cmi[element] = value;
      if (element === 'cmi.completion_status' || element === 'cmi.success_status') checkCompletion();
      if (element === 'cmi.location' || element === 'cmi.suspend_data') {
        if (element === 'cmi.location') {
          cmi['cmi.core.lesson_location'] = String(value || '');
          updateMaxVisitedFromLocation(cmi['cmi.location']);
        }
        emitProgress({ location: getScormLocation() });
        scheduleCommit(800);
      }
      setStatus('Atualizando: ' + element, true);
      return 'true';
    },
    Commit: function() {
      commit(buildPayload());
      return 'true';
    },
    GetLastError: function() { return '0'; },
    GetErrorString: function() { return 'No error'; },
    GetDiagnostic: function() { return ''; },
  };

  // Atualizar os stubs pre-definidos (mesma referencia cacheada pelo adaptador SCORM)
  if (IS_2004) {
    Object.assign(window.API_1484_11, SCORM2004);
  } else {
    Object.assign(window.API, SCORM12);
  }

  updateMaxVisitedFromLocation(getScormLocation());
  lastCommittedFingerprint = fingerprintPayload(buildPayload());

  // Commit ao fechar a aba/janela
  window.addEventListener('beforeunload', function() {
    commit(buildPayload());
  });

  window.addEventListener('pagehide', function() {
    commit(buildPayload());
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      commit(buildPayload());
    }
  });

  document.getElementById('scorm-frame').addEventListener('load', function() {
    setStatus('Conteúdo carregado', true);
    requestFreshToken('frame-loaded');
    bindFrameProgressTracking();
    restoreResumeLocation(12);
    probeFrameProgress();
  });

  setStatus('Iniciando...', false);
  requestFreshToken('launch-init');
  window.setInterval(function() {
    requestFreshToken('heartbeat');
  }, 45000);
  window.setInterval(function() {
    probeFrameProgress();
  }, 3000);
  window.setInterval(function() {
    scheduleCommit(0);
  }, 15000);
})();
</script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Servir arquivo PDF do R2 ─────────────────────────────────────────────────
app.get('/pdf/asset/:cursoId', async (c) => {
  const db = c.env.DB;
  const payload = (await authenticateLmsAssetRequest(c.env, c.req.raw)) as JwtPayload;
  const cursoId = Number(c.req.param('cursoId'));
  const empresaId = Number(payload.empresa_id ?? 0);

  if (payload.token_type === 'lms_asset') {
    throw new ApiError('Token de visualização não é válido para PDF', 403);
  }

  await ensureCourseAssetAccess(db, payload, empresaId, cursoId);

  const curso = await db
    .prepare(
      'SELECT pdf_r2_key FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ pdf_r2_key: string | null }>();

  if (!curso?.pdf_r2_key) return c.text('PDF não encontrado', 404);

  const object = await c.env.BUCKET.get(curso.pdf_r2_key);
  if (!object) return c.text('Not found', 404);

  const headers = buildAssetHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'), 'application/pdf', 'no-store');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('Content-Disposition', 'inline');

  return new Response(object.body, { status: 200, headers });
});

// ── Servir arquivo PPTX do R2 ────────────────────────────────────────────────
app.get('/pptx/asset/:cursoId', async (c) => {
  const db = c.env.DB;
  const payload = (await authenticateLmsAssetRequest(c.env, c.req.raw)) as JwtPayload;
  const cursoId = Number(c.req.param('cursoId'));
  const empresaId = Number(payload.empresa_id ?? 0);

  assertPptxViewerAssetToken(payload, cursoId);

  await ensureCourseAssetAccess(db, payload, empresaId, cursoId);

  const curso = await db
    .prepare(
      'SELECT pptx_r2_key, pptx_slide_count FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL',
    )
    .bind(cursoId, empresaId)
    .first<{ pptx_r2_key: string | null; pptx_slide_count: number }>();

  if (!curso?.pptx_r2_key) return c.text('PPTX não encontrado', 404);

  const object = await c.env.BUCKET.get(curso.pptx_r2_key);
  if (!object) return c.text('Not found', 404);

  const headers = buildAssetHeaders(
    c.env.CORS_ORIGINS,
    c.req.header('Origin'),
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'no-store',
  );
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('Content-Disposition', 'inline');
  headers.set('X-Pptx-Slide-Count', String(curso.pptx_slide_count ?? 0));

  return new Response(object.body, { status: 200, headers });
});

export default app;
