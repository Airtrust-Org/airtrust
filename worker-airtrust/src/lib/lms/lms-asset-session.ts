import type { Env, JwtPayload } from '../../types';
import { verifyJWT } from '../../utils/security';

export const LMS_ASSET_TOKEN_COOKIE = 'airtrust_lms_asset_token';

function parseCookieToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== LMS_ASSET_TOKEN_COOKIE) continue;
    const encoded = rest.join('=').trim();
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return null;
}

export async function readCourseAssetSessionPayload(
  env: Env,
  request: Request,
): Promise<JwtPayload | null> {
  if (!env.JWT_SECRET) return null;
  const token = parseCookieToken(request);
  if (!token) return null;

  let payload: JwtPayload | null = null;
  try {
    payload = (await verifyJWT(token, env.JWT_SECRET)) as JwtPayload | null;
  } catch {
    return null;
  }

  if (
    !payload ||
    payload.token_type !== 'lms_asset' ||
    payload.asset_scope !== 'course_assets' ||
    payload.asset_preview === true
  ) {
    return null;
  }

  return payload;
}

export function assetSessionMatchesEnrollment(
  payload: JwtPayload,
  params: { empresaId: number; cursoId: number; matriculaId: number },
): boolean {
  return (
    Number(payload.empresa_id ?? 0) === params.empresaId &&
    Number(payload.asset_curso_id ?? 0) === params.cursoId &&
    Number(payload.asset_matricula_id ?? 0) === params.matriculaId &&
    payload.asset_preview !== true
  );
}
