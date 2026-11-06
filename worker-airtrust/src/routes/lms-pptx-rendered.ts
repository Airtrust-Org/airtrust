import { resolveAllowedOrigin } from '../config/allowed-origins';
import { pptxRenderedPdfKey } from '../lib/lms/pptx-rendered-asset';

/** Only call AFTER authentication, course-level authorization and tenant checks. */
export async function serveAuthorizedRenderedPptx(
  db: D1Database, bucket: R2Bucket, empresaId: number, cursoId: number,
  corsOrigins: string | undefined, origin: string | undefined,
): Promise<Response> {
  const curso = await db.prepare(
    'SELECT pptx_r2_key, pptx_slide_count, version_tag FROM lms_cursos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL AND tipo_conteudo = ?'
  ).bind(cursoId, empresaId, 'pptx').first<{
    pptx_r2_key: string | null; pptx_slide_count: number; version_tag: string | null;
  }>();
  if (!curso) return new Response('Apresentação não encontrada', { status: 404 });
  const key = pptxRenderedPdfKey(curso.pptx_r2_key, curso.version_tag);
  if (!key || !curso.pptx_r2_key) return new Response('Representação visual indisponível', { status: 404 });
  const original = await bucket.head(curso.pptx_r2_key);
  if (!original) return new Response('Apresentação original indisponível', { status: 404 });
  const derived = await bucket.get(key);
  if (!derived) return new Response('Representação visual indisponível', { status: 404 });
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': resolveAllowedOrigin(origin, corsOrigins),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'ETag, X-Pptx-Slide-Count',
    'X-Pptx-Slide-Count': String(curso.pptx_slide_count ?? 0),
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  // Evidence binds to the ORIGINAL PPTX ETag, never to the PDF's own identity.
  if (original.httpEtag) headers.set('ETag', original.httpEtag);
  return new Response(derived.body, { status: 200, headers });
}
