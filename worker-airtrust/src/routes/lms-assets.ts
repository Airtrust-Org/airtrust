/**
 * LMS — Serviço de arquivos SCORM e página de lançamento
 *
 * GET /api/lms/scorm/assets/:empresa_id/:curso_id/* → arquivos estáticos do R2
 * GET /api/lms/scorm/launch/:matricula_id           → página HTML completa com scorm-again
 */
import { Hono } from 'hono';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import { ApiError } from '../middleware/error-handler';
import { auth, validateAccessTokenSecurityState } from '../middleware/auth';
import { buildResumeStorageScript } from '../services/lms-scorm-local-resume';
import {
  buildScormLocationHelpersScript,
  buildScormProgressParsersScript,
  buildScormSessionCloseRuntimeScript,
} from '../services/lms-scorm-wrapper-runtime';
import { generateJWT, verifyJWT } from '../utils/security';
import { getEmpresaIdOptional } from './escalas-shared';
import type { Env, JwtPayload } from '../types';
import { buildLmsContentSecurityPolicy } from '../lib/lms/security-headers';

const app = new Hono<{ Bindings: Env }>();

const LMS_ASSET_TOKEN_COOKIE = 'airtrust_lms_asset_token';
const LMS_ASSET_TOKEN_MAX_AGE_SECONDS = 15 * 60;
const LMS_PPTX_VIEWER_TOKEN_MAX_AGE_SECONDS = 5 * 60;

type LmsTokenSource = 'authorization' | 'cookie' | 'query';

type ResolvedLmsToken = {
  token: string;
  source: LmsTokenSource;
};

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

export function parseScormLocationMarker(
  location: unknown,
): { current: number; total: number | null } | null {
  if (typeof location !== 'string' || !location.trim()) return null;

  const trimmed = location.trim();
  let match = trimmed.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) {
    match = trimmed.match(/(\d+)\s*of\s*(\d+)/i);
  }
  if (match) {
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0 || current < 0) {
      return null;
    }

    return { current, total };
  }

  const single = Number(trimmed);
  if (Number.isFinite(single) && single > 0) {
    return { current: single, total: null };
  }

  return null;
}

export function parseScormLocationPair(
  location: unknown,
): { current: number; total: number } | null {
  const marker = parseScormLocationMarker(location);
  if (!marker || marker.total == null) return null;
  return { current: marker.current, total: marker.total };
}

export function resolveScormResumeTargetSlide(
  savedLocation: unknown,
  observedLocation: unknown,
): number | null {
  const saved = parseScormLocationMarker(savedLocation);
  if (!saved || saved.current <= 1) return null;

  const observed = parseScormLocationMarker(observedLocation);
  if (observed) {
    if (observed.current >= saved.current) return null;
    if (observed.total != null && saved.current > observed.total) return null;
  }

  return saved.current;
}

/**
 * Parse a value to a finite number, preserving `0`. Returns null only when the
 * value is absent, non-numeric or non-finite. Replaces the `parseFloat(x) || null`
 * idiom in buildPayload(), which silently maps a legitimate `0` (score_raw,
 * score_min, score_scaled, …) to null and loses SCORM state on round-trip.
 */
export function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * DOM-progress authority: a full explicit fraction (current/total) authored by
 * the package is authoritative (package 47/47 beats a "121/135" string on the
 * page). A bare-number authored location (no total) accepts the DOM fraction
 * only when its current matches the authored position — form numbers
 * ("005/123") or regulatory refs ("121/135") never hijack the real counter.
 */
export function resolveProbedScormLocation(params: {
  authored: boolean;
  explicitLocation: unknown;
  domLocation: unknown;
}): { location: string | null; persist: boolean; reason: string } {
  const explicitMarker = parseScormLocationMarker(params.explicitLocation);
  if (params.authored && explicitMarker && explicitMarker.current >= 1 && explicitMarker.total != null) {
    return { location: String(params.explicitLocation), persist: false, reason: 'explicit-package-location' };
  }
  const domMarker = parseScormLocationMarker(params.domLocation);
  if (!domMarker) {
    return { location: explicitMarker ? String(params.explicitLocation) : null, persist: false, reason: 'no-dom-progress' };
  }
  if (params.authored && explicitMarker && explicitMarker.current >= 1 && domMarker.total != null && domMarker.current !== explicitMarker.current) {
    return { location: String(params.explicitLocation), persist: false, reason: 'dom-current-mismatch' };
  }
  const domLocation = domMarker.total == null ? String(domMarker.current) : String(domMarker.current) + '/' + String(domMarker.total);
  return { location: domLocation, persist: true, reason: 'dom-fallback' };
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
  options: { activePrefix?: string | null } = {},
) {
  const normalizedWildcard = normalizeR2Path(wildcard);
  const prefix = `lms/scorm/${empresaId}/${cursoId}/`;
  const directKey = `${prefix}${normalizedWildcard}`;

  if (!normalizedWildcard) {
    return { object: null, resolvedKey: directKey };
  }

  // The course has a pinned/active versioned package prefix (lms_cursos
  // .scorm_package_r2_prefix, e.g. ".../_candidates/<uuid>/"). Resolution
  // must stay strictly within it and fail closed — it must never fall
  // through to a stale flat-path file the course had before it adopted the
  // versioned candidate system (courses migrated from the legacy layout
  // keep that old object in R2 indefinitely), and never to an unordered
  // bucket listing across every candidate the course has ever had. R2
  // list() returns keys in lexicographic order, not by activation recency,
  // so either fallback could silently outrank the actually-active
  // candidate with an older one.
  if (options.activePrefix) {
    const normalizedActivePrefix = options.activePrefix.endsWith('/')
      ? options.activePrefix
      : `${options.activePrefix}/`;
    // A direct hit is only honored here if the wildcard already resolves
    // to a key inside the active prefix — e.g. a relative asset link the
    // launch HTML itself emitted, like "_candidates/<uuid>/app.js".
    if (directKey.startsWith(normalizedActivePrefix)) {
      const scopedDirectObject = await bucket.get(directKey);
      if (scopedDirectObject && !directKey.endsWith('/')) {
        return { object: scopedDirectObject, resolvedKey: directKey };
      }
    }
    const scopedKey = `${normalizedActivePrefix}${normalizedWildcard}`;
    const scopedObject = await bucket.get(scopedKey);
    return { object: scopedObject, resolvedKey: scopedKey };
  }

  let object = await bucket.get(directKey);
  if (object && !directKey.endsWith('/')) {
    return { object, resolvedKey: directKey };
  }

  // Legacy path: no versioned candidate system in use for this course
  // (scorm_package_r2_prefix unset). Historically only a single package
  // ever lived at this flat prefix, so a listing-based lookup remains
  // safe here for backward compatibility with pre-Quality-Gate content.
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
  options: { activePrefix?: string | null } = {},
): Promise<string | null> {
  const { object, resolvedKey } = await resolveScormObject(bucket, empresaId, cursoId, launchFile, options);
  if (!object || !resolvedKey || resolvedKey.endsWith('/')) {
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

function getAuthorizationToken(request: Request): string {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  throw new ApiError('Não autenticado', 401);
}

function getRequestToken(
  request: Request,
  options: { allowScopedQuery?: boolean } = {},
): ResolvedLmsToken {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return { token: authHeader.slice(7), source: 'authorization' };
  }

  if (options.allowScopedQuery) {
    const tokenFromQuery = new URL(request.url).searchParams.get('token')?.trim();
    if (tokenFromQuery) {
      return { token: tokenFromQuery, source: 'query' };
    }
  }

  const cookieHeader = request.headers.get('Cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName !== LMS_ASSET_TOKEN_COOKIE) continue;
    const tokenFromCookie = rawValue.join('=').trim();
    if (!tokenFromCookie) break;
    try {
      return { token: decodeURIComponent(tokenFromCookie), source: 'cookie' };
    } catch {
      break;
    }
  }

  throw new ApiError('Não autenticado', 401);
}

async function authenticateLmsAssetRequest(
  env: Env,
  request: Request,
  options: { allowScopedQuery?: boolean } = {},
) {
  if (!env.JWT_SECRET) {
    throw new ApiError('Configuração do servidor inválida', 500);
  }

  const resolved = getRequestToken(request, options);
  const payload = await verifyJWT(resolved.token, env.JWT_SECRET);
  if (!payload) {
    throw new ApiError('Token inválido ou expirado', 401);
  }

  if (resolved.source !== 'authorization') {
    if (payload.token_type !== 'lms_asset') {
      throw new ApiError('Token de asset inválido', 401);
    }
    return payload;
  }

  // Bearer lms_asset continua escopado/curto e é validado pelos assert*Token
  // específicos da rota. Bearer de sessão normal precisa obedecer ao mesmo
  // estado mutável de segurança de auth(): logout/blocklist, conta ativa,
  // membership atual e role atual do tenant.
  if (payload.token_type === 'lms_asset') {
    return payload;
  }

  const security = await validateAccessTokenSecurityState(env.DB, payload);
  return { ...payload, role: security.role };
}

function assertCourseAssetToken(
  payload: JwtPayload,
  cursoId: number,
  options: { matriculaId?: number; preview?: boolean } = {},
) {
  if (payload.token_type !== 'lms_asset') return;

  if (payload.asset_scope !== 'course_assets' || Number(payload.asset_curso_id ?? 0) !== cursoId) {
    throw new ApiError('Token de asset inválido para este curso', 403);
  }

  if (
    options.matriculaId != null &&
    Number(payload.asset_matricula_id ?? 0) !== options.matriculaId
  ) {
    throw new ApiError('Token de asset inválido para esta matrícula', 403);
  }

  if (options.preview === true && payload.asset_preview !== true) {
    throw new ApiError('Token de asset inválido para pré-visualização', 403);
  }
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
  // None+Secure fora de local (Pages e Workers são sites diferentes em staging).
  const sameSiteDirective = shouldUseSecureAssetCookie(request)
    ? 'SameSite=None; Secure'
    : 'SameSite=Lax';

  headers.append(
    'Set-Cookie',
    `${LMS_ASSET_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/api/lms/; Max-Age=${LMS_ASSET_TOKEN_MAX_AGE_SECONDS}; HttpOnly; ${sameSiteDirective}`,
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
  const jwtSecret = c.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new ApiError('Configuração do servidor inválida', 500);
  }

  const accessToken = getAuthorizationToken(c.req.raw);
  const accessPayload = await verifyJWT(accessToken, jwtSecret);
  if (!accessPayload || (accessPayload.token_type && accessPayload.token_type !== 'access')) {
    throw new ApiError('Token de acesso inválido', 401);
  }

  type AssetSessionRequest = {
    matricula_id?: number;
    curso_id?: number;
    preview?: boolean;
  };
  const body: AssetSessionRequest = await c.req
    .json<AssetSessionRequest>()
    .catch((): AssetSessionRequest => ({}));
  const empresaId = Number(accessPayload.empresa_id ?? 0);
  const matriculaId = Number(body.matricula_id ?? 0);
  const requestedCursoId = Number(body.curso_id ?? 0);
  const preview = body.preview === true;

  if (!empresaId) {
    throw new ApiError('Empresa não identificada no token', 401);
  }

  let cursoId = 0;
  let scopedMatriculaId: number | undefined;

  if (matriculaId > 0) {
    const matricula = await c.env.DB.prepare(
      `SELECT m.id, m.curso_id, m.funcionario_id, m.status, c.ativo, c.publicado
           FROM lms_matriculas m
           JOIN lms_cursos c
             ON c.id = m.curso_id
            AND c.empresa_id = m.empresa_id
            AND c.deleted_at IS NULL
          WHERE m.id = ?
            AND m.empresa_id = ?
            AND m.deleted_at IS NULL`,
    )
      .bind(matriculaId, empresaId)
      .first<{
        id: number;
        curso_id: number;
        funcionario_id: number;
        status: string;
        ativo: number;
        publicado: number;
      }>();

    if (!matricula) throw new ApiError('Matrícula não encontrada', 404);

    const canManage = isPrivilegedRole(accessPayload.role);
    const callerFuncionarioId = Number(accessPayload.funcionario_id ?? 0);
    if (!canManage) {
      if (!callerFuncionarioId || callerFuncionarioId !== matricula.funcionario_id) {
        throw new ApiError('Acesso negado', 403);
      }
      if (matricula.ativo !== 1 || matricula.publicado !== 1 || matricula.status === 'CANCELADO') {
        throw new ApiError('Curso não disponível para este usuário', 403);
      }
    }

    cursoId = matricula.curso_id;
    scopedMatriculaId = matricula.id;
  } else if (preview && requestedCursoId > 0) {
    if (!isPreviewAllowedRole(accessPayload.role)) {
      throw new ApiError('Acesso negado', 403);
    }
    await ensureCourseAssetAccess(c.env.DB, accessPayload, empresaId, requestedCursoId);
    cursoId = requestedCursoId;
  } else {
    throw new ApiError('Informe matricula_id ou curso_id com preview=true', 400);
  }

  const { token } = await generateJWT(
    {
      sub: Number(accessPayload.sub),
      email: accessPayload.email,
      role: accessPayload.role,
      token_type: 'lms_asset',
      asset_scope: 'course_assets',
      asset_curso_id: cursoId,
      asset_matricula_id: scopedMatriculaId,
      asset_preview: preview || undefined,
      empresa_id: empresaId,
      empresas: accessPayload.empresas,
      permissions: accessPayload.permissions,
      funcionario_id: accessPayload.funcionario_id ?? null,
      nome: accessPayload.nome,
    },
    jwtSecret,
    LMS_ASSET_TOKEN_MAX_AGE_SECONDS,
  );

  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(c.req.header('Origin'), c.env.CORS_ORIGINS),
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });
  appendAssetTokenCookie(headers, token, c.req.raw);

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        active: true,
        expiresIn: LMS_ASSET_TOKEN_MAX_AGE_SECONDS,
        cursoId,
        matriculaId: scopedMatriculaId ?? null,
        preview,
      },
    }),
    {
      status: 200,
      headers,
    },
  );
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
      `SELECT id, ativo, publicado, scorm_package_r2_prefix
         FROM lms_cursos
        WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; ativo: number; publicado: number; scorm_package_r2_prefix: string | null }>();
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

async function ensureH5pAssetAccess(db: D1Database, payload: JwtPayload, h5pId: number) {
  const h5p = await resolveCursoFromH5p(db, h5pId);
  if (!h5p) {
    throw new ApiError('Conteúdo H5P não encontrado', 404);
  }

  if (h5p.curso_id) {
    assertCourseAssetToken(payload, h5p.curso_id);
  } else if (payload.token_type === 'lms_asset') {
    throw new ApiError('Token de asset sem curso associado', 403);
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
    'Content-Security-Policy': buildLmsContentSecurityPolicy(),
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
  assertCourseAssetToken(payload, Number(cursoId));
  const cacheBuster = new URL(c.req.url).searchParams.get('airtrust_scorm')?.trim() || null;
  const cursoAccess = await ensureCourseAssetAccess(c.env.DB, payload, Number(empresaId), Number(cursoId));
  const wildcard = extractAssetPathFromRequest(
    new URL(c.req.url).pathname,
    `/api/lms/scorm/assets/${empresaId}/${cursoId}`,
  );
  const rangeHeader = c.req.header('range');

  const { object, resolvedKey } = await resolveScormObject(
    c.env.BUCKET,
    empresaId,
    cursoId,
    wildcard,
    { activePrefix: cursoAccess.scorm_package_r2_prefix },
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

  if (rangeHeader && mime.startsWith('video/')) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const offset = Number(match[1]);
      const endByte = match[2] ? Number(match[2]) : undefined;
      const length = endByte !== undefined ? endByte - offset + 1 : undefined;
      const rangedObject = await c.env.BUCKET.get(resolvedKey, { range: { offset, length } });
      if (rangedObject) {
        const total = rangedObject.size;
        const end = endByte ?? total - 1;
        headers.set('Content-Range', `bytes ${offset}-${end}/${total}`);
        headers.set('Accept-Ranges', 'bytes');
        return new Response(rangedObject.body, { status: 206, headers });
      }
    }
  }

  headers.set('Accept-Ranges', 'bytes');
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
    .prepare('SELECT id, empresa_id, scorm_package_r2_prefix FROM lms_cursos WHERE id = ? AND deleted_at IS NULL')
    .bind(Number(cursoIdParam))
    .first<{ id: number; empresa_id: number; scorm_package_r2_prefix: string | null }>();
  if (!curso) return c.text('Not found', 404);
  assertCourseAssetToken(payload, curso.id);
  await ensureCourseAssetAccess(db, payload, curso.empresa_id, curso.id);

  const { object: foundObject, resolvedKey } = await resolveScormObject(
    c.env.BUCKET,
    curso.empresa_id,
    curso.id,
    wildcard,
    { activePrefix: curso.scorm_package_r2_prefix },
  );
  const rangeHeader = c.req.header('range');

  let object: R2ObjectBody | null = foundObject;
  let status = 200;
  const headers = buildAssetHeaders(
    c.env.CORS_ORIGINS,
    c.req.header('Origin'),
    guessMime(wildcard),
  );

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

  const headers = buildAssetHeaders(
    c.env.CORS_ORIGINS,
    c.req.header('Origin'),
    guessMime(wildcard),
  );
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { status: 200, headers });
});

app.get('/course-assets/:cursoId/thumbnail', async (c) => {
  const db = c.env.DB;
  const cursoId = Number(c.req.param('cursoId'));
  const empresaId = getEmpresaIdOptional(c);
  if (!empresaId) {
    return c.text('Not found', 404);
  }

  const curso = await db
    .prepare(
      `SELECT id, thumbnail_r2_key
         FROM lms_cursos
        WHERE id = ?
          AND empresa_id = ?
          AND deleted_at IS NULL`,
    )
    .bind(cursoId, empresaId)
    .first<{ id: number; thumbnail_r2_key: string | null }>();

  if (!curso?.thumbnail_r2_key) {
    return c.text('Not found', 404);
  }

  const object = await c.env.BUCKET.get(curso.thumbnail_r2_key);
  if (!object) {
    return c.text('Not found', 404);
  }

  const headers = buildAssetHeaders(
    c.env.CORS_ORIGINS,
    c.req.header('Origin'),
    guessMime(curso.thumbnail_r2_key),
    'public, max-age=86400',
  );
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

  if (object.httpEtag) headers.set('ETag', object.httpEtag);

  return new Response(object.body, { status: 200, headers });
});

// ── Página de lançamento SCORM ────────────────────────────────────────────────
// Requer cookie de asset escopado (ou Authorization em clientes internos controlados).

app.get('/scorm/launch/:matricula_id', async (c) => {
  const payload = await authenticateLmsAssetRequest(c.env, c.req.raw);

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
  assertCourseAssetToken(payload, matricula.curso_id, { matriculaId: matricula.id });
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
    { activePrefix: matricula.scorm_package_r2_prefix },
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

  const ciclo = await db
    .prepare(
      `SELECT id, numero_ciclo
         FROM lms_matricula_ciclos
        WHERE matricula_id = ?
          AND empresa_id = ?
          AND ciclo_atual = 1
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
    )
    .bind(matricula.id, empresaId)
    .first<{ id: number; numero_ciclo: number }>();

  const html = buildLaunchPage({
    matriculaId: matricula.id,
    cicloId: ciclo?.id ?? 0,
    numeroCiclo: ciclo?.numero_ciclo ?? 1,
    titulo: matricula.titulo,
    launchUrl,
    commitUrl,
    token: '',
    isScorm2004,
    initialCmiJson,
    hasResumeState,
    assetCacheBuster: Date.now().toString(36),
    reviewMode: matricula.status === 'CONCLUIDO',
  });

  const headers = buildProtectedLaunchHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'));

  return new Response(html, {
    status: 200,
    headers,
  });
});

// ── Pré-visualização SCORM para admin/gestor (sem matrícula) ────────────────

app.get('/scorm/preview/:curso_id', async (c) => {
  const payload = await authenticateLmsAssetRequest(c.env, c.req.raw);

  if (!isPreviewAllowedRole(payload.role)) {
    return new Response('Acesso negado', { status: 403 });
  }

  const empresaId = getEmpresaIdOptional(c) || Number(payload.empresa_id ?? 0);
  const cursoId = Number(c.req.param('curso_id'));
  const db = c.env.DB;

  const curso = await db
    .prepare(
      `
      SELECT id, empresa_id, titulo, scorm_versao, scorm_launch_file, scorm_package_r2_prefix
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
      scorm_package_r2_prefix: string | null;
    }>();

  if (!curso) throw new ApiError('Curso não encontrado', 404);
  assertCourseAssetToken(payload, curso.id, { preview: true });
  if (!curso.scorm_launch_file)
    throw new ApiError('Este curso não tem conteúdo SCORM configurado', 400);

  const resolvedLaunchFile = await resolveScormLaunchFile(
    c.env.BUCKET,
    curso.empresa_id,
    curso.id,
    curso.scorm_launch_file,
    { activePrefix: curso.scorm_package_r2_prefix },
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
    token: '',
    isScorm2004,
    previewMode: true,
    assetCacheBuster: Date.now().toString(36),
  });

  const headers = buildProtectedLaunchHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'));

  return new Response(html, {
    status: 200,
    headers,
  });
});

// ── Builder da página HTML ────────────────────────────────────────────────────

interface LaunchPageConfig {
  matriculaId: number | null;
  cicloId?: number;
  numeroCiclo?: number;
  titulo: string;
  launchUrl: string;
  commitUrl: string | null;
  token: string;
  isScorm2004: boolean;
  initialCmiJson?: string;
  hasResumeState?: boolean;
  previewMode?: boolean;
  assetCacheBuster?: string;
  reviewMode?: boolean;
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

export function buildLaunchPage(cfg: LaunchPageConfig): string {
  const {
    matriculaId,
    cicloId = 0,
    numeroCiclo = 1,
    titulo,
    launchUrl,
    commitUrl,
    token,
    isScorm2004,
    initialCmiJson = '{}',
    hasResumeState = false,
    previewMode,
    assetCacheBuster,
    reviewMode,
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
  #scorm-frame { position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; border: none; display: block; }
  #status-bar {
    position: fixed; top: 0; left: 0; right: 0; height: 28px;
    background: rgba(0,0,0,0.75); color: #9ca3af; font: 11px/28px system-ui;
    padding: 0 12px; display: flex; align-items: center; gap: 10px;
    z-index: 9999; pointer-events: none; opacity: 0; transition: opacity 0.3s;
  }
  #status-bar.visible { opacity: 1; }
  #status-dot { width: 8px; height: 8px; border-radius: 50%; background: #6b7280; flex-shrink: 0; }
  #status-dot.active { background: #22c55e; }
  #status-dot.error { background: #ef4444; }
  #status-bar.error { background: rgba(127,29,29,0.92); }
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
  <p>${previewMode ? 'O conteúdo foi carregado e executado em modo de teste.' : 'Curso concluído e registrado com sucesso.'}</p>
  <button id="btn-close" onclick="${previewMode ? '' : `window.parent.postMessage({type:'lms:completed',matriculaId:${matriculaId ?? 0}}, '*'); `}window.history.back()">
    Fechar
  </button>
</div>

<script>
${buildScormLocationHelpersScript()}

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
  var REVIEW_MODE = ${reviewMode ? 'true' : 'false'};
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
  // Serialize runtime saves. Slow networks could previously leave multiple
  // LMSCommit/autosave requests in flight for the same enrollment, amplifying
  // D1 writes and causing transient save failures. Keep only the latest queued
  // state while preserving final-completion events.
  var commitInFlight = false;
  var queuedCommit = null;
  var completionPending = false;
  var completionObservedAt = null;
  var autosaveReady = false;
  var resumeAppliedThisLoad = false;
  var userNavigatedManually = false;
  // True once the package (LMSSetValue) or server resume state has authored an
  // explicit SCORM location. While true, probeFrameProgress() must never let a
  // generic DOM fraction overwrite cmi.location / cmi.core.lesson_location.
  var explicitLocationAuthored = (function() {
    if (${hasResumeState ? 'true' : 'false'}) return true;
    var initial = cmi['cmi.location'] || cmi['cmi.core.lesson_location'] || null;
    var marker = parseScormLocationMarker(initial);
    return !!(marker && marker.current >= 1);
  })();
  // Set once the content calls LMSInitialize/Initialize. Governed close only
  // mirrors an explicit SCORM termination when the API was actually initialized.
  var apiInitialized = false;
  // Guards the governed "Sair do curso" handshake against double execution.
  var sessionCloseHandled = false;

  ${buildResumeStorageScript({
    matriculaId,
    cicloId,
    numeroCiclo,
  })}

  var SCORM_DIAG = (function(){ try { return /[?&]scorm_diag=1(&|$)/.test(window.location.search); } catch(e) { return false; } })();
  function diag(msg) { if (SCORM_DIAG) console.info('[SCORM_DIAG]' + msg); }
  diag(' WRAPPER_START mid=' + MATRICULA_ID + ' preview=' + PREVIEW_MODE + ' token_present=' + (TOKEN && TOKEN.length > 10 ? '1' : '0') + ' url=' + (COMMIT_URL || 'null'));

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

  if (!PREVIEW_MODE) {
    requestFreshToken('launch');
  }

  var statusHideTimer = null;
  function setStatus(text, active, persistent) {
    var bar = document.getElementById('status-bar');
    var dot = document.getElementById('status-dot');
    var txt = document.getElementById('status-text');
    var isError = persistent === true;
    if (dot) {
      dot.className = isError ? 'error' : (active ? 'active' : '');
    }
    if (txt) txt.textContent = text;
    if (bar) {
      bar.className = isError ? 'error visible' : 'visible';
      if (statusHideTimer) window.clearTimeout(statusHideTimer);
      statusHideTimer = null;
      if (!isError) {
        statusHideTimer = window.setTimeout(function() { bar.classList.remove('visible'); }, 2500);
      }
    }
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
      var d = data || {};
      return JSON.stringify([d.lesson_status, d.completion_status, d.success_status, d.score_raw, d.suspend_data, getScormLocation()]);
    } catch (_error) {
      return '';
    }
  }

  function parseLocationPair(location) {
    return parseScormLocationPair(location);
  }

  function parseLocationMarker(location) {
    return parseScormLocationMarker(location);
  }

  function setScormLocation(location) {
    if (!location || typeof location !== 'string') return;
    cmi['cmi.location'] = location;
    cmi['cmi.core.lesson_location'] = location;
  }

  function sanitizeTelemetryValue(field, value) {
    if (field === 'cmi.suspend_data') {
      var suspendText = typeof value === 'string' ? value : '';
      return {
        present: suspendText.trim().length > 0,
        bytes: suspendText.length,
      };
    }

    if (field === 'cmi.location' || field === 'cmi.core.lesson_location') {
      var marker = parseLocationMarker(value);
      if (!marker) return null;
      return marker.total == null ? String(marker.current) : String(marker.current) + '/' + String(marker.total);
    }

    if (
      field === 'cmi.core.lesson_status' ||
      field === 'cmi.completion_status' ||
      field === 'cmi.success_status'
    ) {
      return value == null ? null : String(value);
    }

    return value == null ? null : String(value);
  }

  function emitTelemetry(eventType, details) {
    var payload = Object.assign({
      matricula_id: MATRICULA_ID,
      event: eventType,
      location: sanitizeTelemetryValue('cmi.location', getScormLocation()),
      suspend_data: sanitizeTelemetryValue('cmi.suspend_data', cmi['cmi.suspend_data']),
      timestamp: new Date().toISOString(),
    }, details || {});

    try {
      console.info('[SCORM_TELEMETRY]', JSON.stringify(payload));
    } catch (_error) {
      console.info('[SCORM_TELEMETRY]', payload);
    }

    postToParent({
      type: 'lms:scorm-telemetry',
      matriculaId: MATRICULA_ID,
      telemetry: payload,
    });
  }

  function notifyCompletionPending(stage, reason) {
    if (!completionObservedAt) {
      completionObservedAt = new Date().toISOString();
    }
    completionPending = true;
    var message =
      stage === 'saving'
        ? 'Conclusão recebida. Salvando progresso...'
        : 'Conclusão recebida, mas ainda não confirmada pelo servidor.';
    setStatus(message, true, stage !== 'saving');
    postToParent({
      type: stage === 'saving' ? 'lms:completion-pending' : 'lms:save-warning',
      matriculaId: MATRICULA_ID,
      stage: stage || 'pending',
      message: message,
      reason: reason || null,
    });
  }

  function notifyCompletionError(code, reason, customMessage) {
    if (!completionPending) return;
    var message = customMessage || 'Conclusão recebida, mas ainda não confirmada pelo servidor.';
    setStatus(message, true, true);
    postToParent({
      type: 'lms:save-error',
      matriculaId: MATRICULA_ID,
      reason: reason || 'completion-unconfirmed',
      code: code || null,
      message: message,
    });
    postToParent({
      type: 'lms:completion-error',
      matriculaId: MATRICULA_ID,
      code: code || 'SCORM_COMPLETION_REJECTED',
      message: message,
      reason: reason || null,
    });
  }

  function extractSanitizedError(json, status) {
    var fallbackCode = status >= 500 || status === 429 ? 'SCORM_FINAL_COMMIT_MISSING' : 'SCORM_COMMIT_REJECTED';
    var fallbackReason = 'http-' + String(status);
    var fallbackMsg = 'Não foi possível salvar o progresso.';

    if (!json || typeof json !== 'object') {
      return { code: fallbackCode, reason: fallbackReason, message: fallbackMsg };
    }

    var rawCode = typeof json.code === 'string' ? json.code.trim() : null;
    var rawMsg = (typeof json.error === 'string' && json.error.trim())
      ? json.error.trim()
      : (typeof json.message === 'string' && json.message.trim())
        ? json.message.trim()
        : null;

    if (rawMsg && (rawMsg.indexOf('<') !== -1 || rawMsg.indexOf('SQLITE_') !== -1 || rawMsg.indexOf('stack:') !== -1 || rawMsg.indexOf('at ') === 0)) {
      rawMsg = null;
    }

    return {
      code: rawCode || fallbackCode,
      reason: rawCode || fallbackReason,
      message: rawMsg || fallbackMsg,
    };
  }



  function applyLocalResumeBackup() {
    var backup = readLocalResumeBackup();
    if (!backup) return;

    var currentLocation = getScormLocation();
    var backupMarker = parseLocationMarker(backup.location);
    var currentMarker = parseLocationMarker(currentLocation);
    if (!backupMarker) return;
    if (currentMarker && currentMarker.current >= backupMarker.current) return;

    setScormLocation(String(backup.location));
    if (IS_2004) {
      cmi['cmi.entry'] = 'resume';
    } else {
      cmi['cmi.core.entry'] = 'resume';
    }
    emitTelemetry('SCORM_RESUME_APPLIED', {
      field: 'cmi.location',
      previous_value: sanitizeTelemetryValue('cmi.location', currentLocation),
      next_value: sanitizeTelemetryValue('cmi.location', backup.location),
      decision: 'preserved',
      reason: 'local-backup-stronger-than-server',
    });
    return true;
  }

  function protectLocationValue(currentValue, nextValue) {
    var currentText = typeof currentValue === 'string' ? currentValue.trim() : '';
    var nextText = typeof nextValue === 'string' ? nextValue.trim() : '';
    var currentMarker = parseLocationMarker(currentText);
    var nextMarker = parseLocationMarker(nextText);

    if (!currentMarker || currentMarker.current <= 1) {
      return { value: nextText || currentText || '', blocked: false, reason: 'no-strong-location' };
    }

    if (!nextText) {
      return { value: currentText, blocked: true, reason: 'empty-location' };
    }

    if (
      nextMarker &&
      nextMarker.current < currentMarker.current &&
      (
        nextMarker.total == null ||
        currentMarker.total == null ||
        nextMarker.total === currentMarker.total ||
        currentMarker.current <= nextMarker.total
      )
    ) {
      return { value: currentText, blocked: true, reason: 'regressive-location' };
    }

    return { value: nextText, blocked: false, reason: 'accepted-location' };
  }

  var SUSPEND_DATA_NEAR_LIMIT_THRESHOLD = 3800; // shrink near SCORM 1.2's ~4096B suspend_data ceiling = finalization, not a mid-session reset
  function protectSuspendDataValue(currentValue, nextValue) {
    var currentText = typeof currentValue === 'string' ? currentValue : '';
    var nextText = typeof nextValue === 'string' ? nextValue : '';
    if (currentText && !nextText.trim()) {
      return { value: currentText, blocked: true, reason: 'empty-suspend-data' };
    }
    if (currentText && nextText && nextText.length < currentText.length) {
      if (currentText.length >= SUSPEND_DATA_NEAR_LIMIT_THRESHOLD) {
        return { value: nextText, blocked: false, reason: 'accepted-suspend-data-near-limit-shrink' };
      }
      return { value: currentText, blocked: true, reason: 'shorter-suspend-data' };
    }
    return { value: nextText || currentText || '', blocked: false, reason: 'accepted-suspend-data' };
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

${buildScormProgressParsersScript()}

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
      if (!target) { autosaveReady = true; return; }

      var frame = document.getElementById('scorm-frame');
      if (!frame || !frame.contentWindow || !frame.contentWindow.document) {
        if (remainingAttempts > 0) {
          window.setTimeout(function() {
            restoreResumeLocation(remainingAttempts - 1);
          }, 250);
        } else {
          autosaveReady = true;
        }
        return;
      }

      var frameWindow = frame.contentWindow;
      var doc = frameWindow.document;
      var parsed = parseProgressFromDocument(doc);
      var observedLocation = parsed ? String(parsed.current) + '/' + String(parsed.total) : null;
      var effectiveTarget = resolveScormResumeTargetSlide(savedLocation, observedLocation);
      if (!effectiveTarget) { autosaveReady = true; return; }

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
      } else {
        autosaveReady = true;
      }
    } catch (_error) {
      if (remainingAttempts > 0) {
        window.setTimeout(function() {
          restoreResumeLocation(remainingAttempts - 1);
        }, 250);
      } else {
        autosaveReady = true;
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
      if (!frame || !frame.contentWindow || !frame.contentWindow.document) {
        diag(' PROBE_SKIPPED no_frame_or_dom');
        return;
      }
      var doc = frame.contentWindow.document;
      var parsed = parseProgressFromDocument(doc);
      if (!parsed) {
        diag(' PROBE_NO_PROGRESS_PARSED');
        return;
      }

      var existingLocation = getScormLocation();
      var previousLocation = existingLocation;
      var existingParsed = parseLocationMarker(existingLocation);
      var domLocationRaw = parsed.total > 0
        ? String(parsed.current) + '/' + String(parsed.total)
        : String(parsed.current);

      // Autoridade: se o pacote (ou o resume state do servidor) já informou uma
      // posição SCORM explícita, uma fração genérica lida do DOM NÃO pode
      // substituí-la — nem quando o denominador do DOM é maior. Nesse caso o
      // probe apenas espelha a posição canônica para a barra de progresso.
      var probeDecision = resolveProbedScormLocation(
        explicitLocationAuthored,
        existingLocation,
        domLocationRaw
      );

      if (!probeDecision.persist) {
        diag(' PROBE_LOCATION_KEPT reason=' + probeDecision.reason + ' loc=' + (existingLocation || 'null'));
        if (existingParsed) {
          var keptTotal = existingParsed.total != null ? existingParsed.total : parsed.total;
          emitProgress({
            progresso_pct: keptTotal
              ? Math.round((existingParsed.current / keptTotal) * 100)
              : undefined,
            location: existingLocation,
            slide_current: existingParsed.current,
            slide_total: existingParsed.total != null ? existingParsed.total : undefined,
            reached_end: existingParsed.total != null && existingParsed.current >= existingParsed.total,
          });
        }
        return;
      }

      var effectiveCurrent = parsed.current;
      var effectiveTotal = parsed.total;

      // Nunca deixe a leitura do DOM regredir um marcador já salvo (fallback).
      if (
        existingParsed &&
        parsed.total > 0 &&
        existingParsed.current > parsed.current &&
        (
          existingParsed.total === parsed.total ||
          (existingParsed.total == null && existingParsed.current <= parsed.total)
        )
      ) {
        effectiveCurrent = existingParsed.current;
        effectiveTotal = parsed.total;
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
      writeLocalResumeBackup('frame-probe');
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

  function isFinalCommitEvent(eventType) {
    return [
      'SCORM_FINISH',
      'SCORM_COMPLETION_CANDIDATE',
      'SCORM_BEFORE_UNLOAD_COMMIT',
      'SCORM_VISIBILITY_COMMIT',
    ].indexOf(String(eventType || '').toUpperCase()) !== -1;
  }

  function isRetryableCommitStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  function queueLatestCommit(data, eventType) {
    if (!queuedCommit || isFinalCommitEvent(eventType) || !isFinalCommitEvent(queuedCommit.eventType)) {
      queuedCommit = { data: data, eventType: eventType || 'SCORM_COMMIT' };
    }
  }

  function flushQueuedCommit() {
    if (commitInFlight || !queuedCommit) return;
    var next = queuedCommit;
    queuedCommit = null;
    commit(next.data, 0, next.eventType);
  }

  function commit(data, attempt, eventType) {
    if (PREVIEW_MODE || REVIEW_MODE || !COMMIT_URL || MATRICULA_ID == null) {
      diag(' COMMIT_SKIPPED preview=' + PREVIEW_MODE + ' review=' + REVIEW_MODE + ' url=' + (COMMIT_URL || 'null') + ' mid=' + MATRICULA_ID);
      return Promise.resolve();
    }

    var currentAttempt = attempt || 0;
    if (currentAttempt === 0 && commitInFlight) {
      queueLatestCommit(data, eventType);
      diag(' COMMIT_QUEUED event=' + (eventType || '?'));
      return Promise.resolve(null);
    }
    if (currentAttempt === 0) commitInFlight = true;

    var payloadFingerprint = fingerprintPayload(data);
    emitTelemetry(eventType || 'SCORM_COMMIT', {
      decision: 'accepted',
      reason: 'commit-dispatched',
      field: null,
    });
    diag(' COMMIT_FETCH_START event=' + (eventType || '?') + ' attempt=' + currentAttempt + ' has_loc=' + (!!getScormLocation() ? '1' : '0'));

    var requestPromise = getFreshToken('commit').then(function(freshToken) {
      if (!freshToken) {
        diag(' COMMIT_NO_TOKEN');
        return null;
      }
      var requestBody = Object.assign({
        matricula_id: MATRICULA_ID,
        commit_event: eventType || 'SCORM_COMMIT',
        completion_candidate: completionPending ? true : null,
        completion_observed_at: completionObservedAt,
      }, data);
      // Browsers cap the TOTAL body size across in-flight keepalive fetches
      // per page (~64KB). Reserve keepalive for teardown only.
      var needsKeepalive = eventType === 'SCORM_BEFORE_UNLOAD_COMMIT' || eventType === 'SCORM_VISIBILITY_COMMIT';
      return fetch(COMMIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + freshToken,
        },
        body: JSON.stringify(requestBody),
        keepalive: needsKeepalive,
      });
    }).then(function(response) {
      if (response && response.ok) {
        diag(' COMMIT_FETCH_STATUS=' + String(response.status) + ' OK');
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
            completionPending = false;
            clearLocalResumeBackup();
            setStatus('Curso concluído e registrado com sucesso.', true);
            var _ov2 = document.getElementById('completion-overlay');
            if (_ov2) _ov2.classList.add('show');
            postToParent({ type: 'lms:completed', matriculaId: MATRICULA_ID });
            return;
          }

          if (json.data.completion_diagnostic && json.data.completion_diagnostic.status === 'candidate') {
            // High progress/final location alone is not a completion event. Keep
            // the runtime quiet unless this session actually observed one.
            if (completionPending) {
              notifyCompletionPending('pending', json.data.completion_diagnostic.code || null);
            }
            return;
          }

          if (completionPending) {
            notifyCompletionError(
              json.data.completion_diagnostic && json.data.completion_diagnostic.code,
              'server-did-not-confirm-completion',
            );
          }
        }).catch(function() { return null; });
        return response;
      }

      if (!response) return response;
      var status = Number(response.status || 0);
      var retryable = isRetryableCommitStatus(status);
      diag(' COMMIT_FETCH_STATUS=' + String(status) + ' ERROR retryable=' + (retryable ? '1' : '0'));

      if (retryable && currentAttempt < 2) {
        setStatus('Falha temporária ao salvar progresso. Tentando novamente...', true, true);
        postToParent({
          type: 'lms:save-error',
          matriculaId: MATRICULA_ID,
          reason: 'http-' + String(status),
          attempt: currentAttempt,
        });
        return new Promise(function(resolve) { window.setTimeout(resolve, 1200); }).then(function() {
          return commit(data, currentAttempt + 1, eventType);
        });
      }

      var handleNonOkResponse = function(errJson) {
        var err = extractSanitizedError(errJson, status);
        setStatus(err.message, true, true);
        postToParent({
          type: 'lms:save-error',
          matriculaId: MATRICULA_ID,
          reason: err.reason,
          code: err.code,
          message: err.message,
          attempt: currentAttempt,
        });
        if (completionPending) {
          notifyCompletionError(err.code, err.reason, err.message);
        }
      };

      try {
        response.clone().json().then(function(json) {
          handleNonOkResponse(json);
        }).catch(function() {
          handleNonOkResponse(null);
        });
      } catch (_jsonErr) {
        handleNonOkResponse(null);
      }
      return response;
    }).catch(function(e) {
      console.warn('[SCORM] commit error', e);
      if (currentAttempt < 2) {
        setStatus('Falha temporária ao salvar progresso. Tentando novamente...', true, true);
        postToParent({
          type: 'lms:save-error',
          matriculaId: MATRICULA_ID,
          reason: 'network-error',
          attempt: currentAttempt,
        });
        return new Promise(function(resolve) { window.setTimeout(resolve, 1200); }).then(function() {
          return commit(data, currentAttempt + 1, eventType);
        });
      }

      setStatus('Não foi possível salvar o progresso.', true, true);
      postToParent({
        type: 'lms:save-error',
        matriculaId: MATRICULA_ID,
        reason: 'network-error',
        attempt: currentAttempt,
      });
      if (completionPending) {
        notifyCompletionError('SCORM_FINAL_COMMIT_MISSING', 'network-error');
      }
      return null;
    });

    if (currentAttempt !== 0) return requestPromise;
    return requestPromise.finally(function() {
      commitInFlight = false;
      flushQueuedCommit();
    });
  }

  function scheduleCommit(delayMs) {
    if (PREVIEW_MODE || MATRICULA_ID == null || !autosaveReady) return;
    if (autosaveTimer) {
      window.clearTimeout(autosaveTimer);
    }

    autosaveTimer = window.setTimeout(function() {
      autosaveTimer = null;
      var payload = buildPayload();
      var payloadFingerprint = fingerprintPayload(payload);
      diag(' SCHEDULE_COMMIT loc=' + (getScormLocation() || 'null') + ' fp_match=' + (payloadFingerprint === lastCommittedFingerprint ? '1' : '0') + ' has_cmi=' + (payload.cmi_json && payload.cmi_json !== '{}' ? '1' : '0'));
      if (!payloadFingerprint || payloadFingerprint === lastCommittedFingerprint) return;
      commit(payload, 0, 'SCORM_COMMIT');
    }, typeof delayMs === 'number' ? delayMs : 1500);
  }

  function buildPayload() {
    writeLocalResumeBackup('build-payload');
    if (IS_2004) {
      return {
        completion_status: cmi['cmi.completion_status'] || null,
        success_status: cmi['cmi.success_status'] || null,
        score_raw: finiteNumberOrNull(cmi['cmi.score.raw']),
        score_max: finiteNumberOrNull(cmi['cmi.score.max']),
        score_min: finiteNumberOrNull(cmi['cmi.score.min']),
        score_scaled: finiteNumberOrNull(cmi['cmi.score.scaled']),
        session_time: cmi['cmi.session_time'] || null,
        total_time: cmi['cmi.total_time'] || null,
        suspend_data: cmi['cmi.suspend_data'] || null,
        launch_data: cmi['cmi.launch_data'] || null,
        cmi_json: JSON.stringify(cmi),
      };
    }
    return {
      lesson_status: cmi['cmi.core.lesson_status'] || null,
      score_raw: finiteNumberOrNull(cmi['cmi.core.score.raw']),
      score_max: finiteNumberOrNull(cmi['cmi.core.score.max']),
      score_min: finiteNumberOrNull(cmi['cmi.core.score.min']),
      session_time: cmi['cmi.core.session_time'] || null,
      total_time: cmi['cmi.core.total_time'] || null,
      suspend_data: cmi['cmi.suspend_data'] || null,
      launch_data: cmi['cmi.launch_data'] || null,
      cmi_json: JSON.stringify(cmi),
    };
  }

  function checkCompletion() {
    if (completed || REVIEW_MODE) return;
    var ls = cmi['cmi.core.lesson_status'] || '';
    var cs = cmi['cmi.completion_status'] || '';
    var ss = cmi['cmi.success_status'] || '';
    if (
      ls === 'passed' ||
      ls === 'completed' ||
      cs === 'completed' ||
      (ss === 'passed' && cs !== 'incomplete')
    ) {
      notifyCompletionPending('saving', 'status-signaled-completion');
      emitTelemetry('SCORM_COMPLETION_CANDIDATE', {
        decision: 'pending-server-confirmation',
        reason: 'status-signaled-completion',
      });
      commit(buildPayload(), 0, 'SCORM_COMPLETION_CANDIDATE');
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

${buildScormSessionCloseRuntimeScript()}

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    // Inner-frame diagnostics arrive on the worker origin (not PARENT_ORIGIN),
    // so they must be matched by source identity before the parent-origin gate.
    if (relayPackageDiagnostics(event)) return;
    if (PARENT_ORIGIN !== '*' && event.origin !== PARENT_ORIGIN) return;
    if (event.data.type === 'lms:session-close') {
      performGovernedSessionClose(typeof event.data.reason === 'string' ? event.data.reason : null);
      return;
    }
    if (event.data.type === 'lms:auth-token' && (event.data.previewMode === PREVIEW_MODE)) {
      updateToken(event.data.token || '');
      return;
    }
    if (event.data.type === 'lms:navigate' && (event.data.direction === 'prev' || event.data.direction === 'next')) {
      userNavigatedManually = true;
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
      apiInitialized = true;
      diag(' LMSInitialize_CALLED loc=' + (getScormLocation() || 'null'));
      setStatus('SCORM inicializado', true);
      emitTelemetry('SCORM_INIT', {
        decision: 'accepted',
        reason: ${hasResumeState ? "'server-resume-state'" : "'fresh-launch'"},
      });
      return 'true';
    },
    LMSFinish: function() {
      probeFrameProgress(); var finalLocation = parseLocationMarker(getScormLocation()); if (finalLocation && finalLocation.total != null && finalLocation.current >= finalLocation.total) notifyCompletionPending('saving', 'finish-at-final-location'); diag(' LMSFinish_CALLED loc=' + (getScormLocation() || 'null'));
      commit(buildPayload(), 0, 'SCORM_FINISH');
      setStatus('Sessão encerrada', false);
      return 'true';
    },
    LMSGetValue: function(element) {
      return cmi[element] !== undefined ? String(cmi[element]) : '';
    },
    LMSSetValue: function(element, value) {
      var previousValue = cmi[element];
      var nextValue = value;
      var decision = 'accepted';
      var reason = 'passthrough';

      if (element === 'cmi.core.lesson_location') {
        var locationDecision = protectLocationValue(getScormLocation(), String(value || ''));
        nextValue = locationDecision.value;
        decision = locationDecision.blocked ? 'blocked' : 'accepted';
        reason = locationDecision.reason;
      } else if (element === 'cmi.suspend_data') {
        var suspendDecision = protectSuspendDataValue(cmi['cmi.suspend_data'], String(value || ''));
        nextValue = suspendDecision.value;
        decision = suspendDecision.blocked ? 'blocked' : 'accepted';
        reason = suspendDecision.reason;
      }

      cmi[element] = nextValue;
      if (element === 'cmi.core.lesson_status') {
        checkCompletion();
        scheduleCommit(800);
      }
      if (element === 'cmi.core.lesson_location' || element === 'cmi.suspend_data') {
        if (element === 'cmi.core.lesson_location') {
          setScormLocation(String(nextValue || ''));
          updateMaxVisitedFromLocation(cmi['cmi.location']);
          if (decision !== 'blocked' && parseScormLocationMarker(String(nextValue || ''))) {
            explicitLocationAuthored = true;
          }
        }
        writeLocalResumeBackup('set-value');
        emitProgress({ location: getScormLocation() });
        diag(' LMSSetValue field=' + element + ' changed=' + (previousValue === nextValue ? '0' : '1') + ' loc=' + (getScormLocation() || 'null') + ' blocked=' + (decision === 'blocked' ? '1' : '0'));
        if (previousValue !== nextValue) scheduleCommit(800);
      }
      emitTelemetry(decision === 'blocked' ? 'SCORM_REGRESSION_BLOCKED' : 'SCORM_SET_VALUE', {
        field: element,
        previous_value: sanitizeTelemetryValue(element, previousValue),
        next_value: sanitizeTelemetryValue(element, nextValue),
        decision: decision,
        reason: reason,
      });
      setStatus('Atualizando: ' + element, true);
      return 'true';
    },
    LMSCommit: function() {
      diag(' LMSCommit_CALLED loc=' + (getScormLocation() || 'null'));
      commit(buildPayload(), 0, 'SCORM_COMMIT');
      return 'true';
    },
    LMSGetLastError: function() { return '0'; },
    LMSGetErrorString: function() { return 'No error'; },
    LMSGetDiagnostic: function() { return ''; },
  };

  // ── SCORM 2004 API ──────────────────────────────────────────────────────────
  var SCORM2004 = {
    Initialize: function() {
      apiInitialized = true;
      diag(' LMSInitialize_CALLED_2004 loc=' + (getScormLocation() || 'null'));
      setStatus('SCORM 2004 inicializado', true);
      emitTelemetry('SCORM_INIT', {
        decision: 'accepted',
        reason: ${hasResumeState ? "'server-resume-state'" : "'fresh-launch'"},
      });
      return 'true';
    },
    Terminate: function() {
      diag(' LMSFinish_CALLED_2004 loc=' + (getScormLocation() || 'null'));
      commit(buildPayload(), 0, 'SCORM_FINISH');
      setStatus('Sessão encerrada', false);
      return 'true';
    },
    GetValue: function(element) {
      return cmi[element] !== undefined ? String(cmi[element]) : '';
    },
    SetValue: function(element, value) {
      var previousValue = cmi[element];
      var nextValue = value;
      var decision = 'accepted';
      var reason = 'passthrough';

      if (element === 'cmi.location') {
        var locationDecision = protectLocationValue(getScormLocation(), String(value || ''));
        nextValue = locationDecision.value;
        decision = locationDecision.blocked ? 'blocked' : 'accepted';
        reason = locationDecision.reason;
      } else if (element === 'cmi.suspend_data') {
        var suspendDecision = protectSuspendDataValue(cmi['cmi.suspend_data'], String(value || ''));
        nextValue = suspendDecision.value;
        decision = suspendDecision.blocked ? 'blocked' : 'accepted';
        reason = suspendDecision.reason;
      }

      cmi[element] = nextValue;
      if (element === 'cmi.completion_status' || element === 'cmi.success_status') {
        checkCompletion();
        scheduleCommit(800);
      }
      if (element === 'cmi.location' || element === 'cmi.suspend_data') {
        if (element === 'cmi.location') {
          setScormLocation(String(nextValue || ''));
          updateMaxVisitedFromLocation(cmi['cmi.location']);
          if (decision !== 'blocked' && parseScormLocationMarker(String(nextValue || ''))) {
            explicitLocationAuthored = true;
          }
        }
        writeLocalResumeBackup('set-value');
        emitProgress({ location: getScormLocation() });
        if (previousValue !== nextValue) scheduleCommit(800);
      }
      emitTelemetry(decision === 'blocked' ? 'SCORM_REGRESSION_BLOCKED' : 'SCORM_SET_VALUE', {
        field: element,
        previous_value: sanitizeTelemetryValue(element, previousValue),
        next_value: sanitizeTelemetryValue(element, nextValue),
        decision: decision,
        reason: reason,
      });
      setStatus('Atualizando: ' + element, true);
      return 'true';
    },
    Commit: function() {
      diag(' LMSCommit_CALLED_2004 loc=' + (getScormLocation() || 'null'));
      commit(buildPayload(), 0, 'SCORM_COMMIT');
      return 'true';
    },
    GetLastError: function() { return '0'; },
    GetErrorString: function() { return 'No error'; },
    GetDiagnostic: function() { return ''; },
  };

  // Atualizar os stubs pre-definidos (mesma referencia cacheada pelo adaptador SCORM)
  if (IS_2004) {
    Object.assign(window.API_1484_11, SCORM2004);
    diag(' API_READY version=2004 mid=' + MATRICULA_ID);
  } else {
    Object.assign(window.API, SCORM12);
    diag(' API_READY version=1.2 mid=' + MATRICULA_ID + ' has_token=' + (TOKEN ? '1' : '0'));
  }

  var appliedBackup = applyLocalResumeBackup();
  if (appliedBackup) {
    diag(' RESUME_APPLIED loc=' + (getScormLocation() || 'null') + ' scheduling_commit_3s');
  }
  updateMaxVisitedFromLocation(getScormLocation());
  if (appliedBackup) {
    lastCommittedFingerprint = '';
    scheduleCommit(3000);
  } else {
    lastCommittedFingerprint = fingerprintPayload(buildPayload());
  }

  // Commit ao fechar a aba/janela
  window.addEventListener('beforeunload', function() {
    commit(buildPayload(), 0, 'SCORM_BEFORE_UNLOAD_COMMIT');
  });

  window.addEventListener('pagehide', function() {
    commit(buildPayload(), 0, 'SCORM_BEFORE_UNLOAD_COMMIT');
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      commit(buildPayload(), 0, 'SCORM_VISIBILITY_COMMIT');
    }
  });

  document.getElementById('scorm-frame').addEventListener('load', function() {
    setStatus('Conteúdo carregado', true);
    requestFreshToken('frame-loaded');
    bindFrameProgressTracking();
    if (!resumeAppliedThisLoad && !userNavigatedManually) {
      resumeAppliedThisLoad = true;
      restoreResumeLocation(12);
    } else {
      autosaveReady = true;
    }
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
  var heartbeatCount = 0;
  window.setInterval(function() {
    heartbeatCount += 1;
    diag(' HEARTBEAT #' + heartbeatCount + ' loc=' + (getScormLocation() || 'null'));
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

  const headers = buildAssetHeaders(
    c.env.CORS_ORIGINS,
    c.req.header('Origin'),
    'application/pdf',
    'no-store',
  );
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  headers.set('Content-Disposition', 'inline');

  return new Response(object.body, { status: 200, headers });
});

// ── Servir arquivo PPTX do R2 ────────────────────────────────────────────────
app.get('/pptx/asset/:cursoId', async (c) => {
  const db = c.env.DB;
  const payload = (await authenticateLmsAssetRequest(c.env, c.req.raw, {
    allowScopedQuery: true,
  })) as JwtPayload;
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
