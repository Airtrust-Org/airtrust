/**
 * Select an unambiguous published Native edition for NEW enrollment.
 * Requires an exact staged tenant+course marker and the complete PRIVATE
 * R2 artifact bytes before any transactional enrollment is attempted.
 *
 * Not mounted or enabled until governed Schema V2 and D1 rehearsal.
 */
import { validateNativeCourseArtifact } from '../lib/lms/lms-native-course-contract';
import type { Env } from '../types';

export class NativeEditionSelectionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeEditionSelectionError';
  }
}

type Edition = {
  id: number; artifact_sha256: string; package_version: string; r2_prefix: string;
};
const SHA = /^[0-9a-f]{64}$/;
const VERSION = /^n-[0-9a-f]{32}$/;
const MAX_PRIVATE_BYTES = 4 * 1024 * 1024;

export async function selectNativeEnrollmentEdition(params: {
  env: Env; empresaId: number; cursoId: number;
}): Promise<number> {
  const { env, empresaId, cursoId } = params;
  if (![empresaId, cursoId].every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new NativeEditionSelectionError('NATIVE_EDITION_SELECTION_INVALID_CONTEXT');
  }
  let editions: { results?: Edition[] } | null;
  try {
    editions = await env.DB.prepare([
      'SELECT ed.id,ed.artifact_sha256,ed.package_version,ed.r2_prefix',
      'FROM lms_native_edicoes ed',
      'JOIN lms_cursos c ON c.id=ed.curso_id AND c.empresa_id=ed.empresa_id',
      'JOIN lms_native_catalog_activation a ON a.curso_id=c.id AND a.empresa_id=c.empresa_id',
      'WHERE c.id=? AND c.empresa_id=?',
      "AND c.tipo_conteudo='scorm' AND c.ativo=1 AND c.publicado=1",
      "AND c.deleted_at IS NULL AND ed.status='PUBLISHED'",
      'ORDER BY ed.id DESC LIMIT 2',
    ].join(' ')).bind(cursoId, empresaId).all<Edition>();
  } catch {
    throw new NativeEditionSelectionError('NATIVE_EDITION_LOOKUP_FAILED');
  }
  if (!editions || !Array.isArray(editions.results) || editions.results.length !== 1) {
    // Never silently select "latest" when published versions are ambiguous.
    throw new NativeEditionSelectionError('NATIVE_EDITION_NOT_UNAMBIGUOUS');
  }
  const edition = editions.results[0];
  const prefix = `lms/native/${empresaId}/${cursoId}/${edition.artifact_sha256}/`;
  if (!Number.isSafeInteger(edition.id) || edition.id <= 0 ||
      !SHA.test(edition.artifact_sha256) || !VERSION.test(edition.package_version) ||
      edition.r2_prefix !== prefix) {
    throw new NativeEditionSelectionError('NATIVE_EDITION_METADATA_INVALID');
  }

  let object: R2ObjectBody | null;
  try {
    object = await env.BUCKET.get(prefix + 'native-private-candidate.json');
  } catch {
    throw new NativeEditionSelectionError('NATIVE_EDITION_ARTIFACT_UNAVAILABLE');
  }
  if (!object || object.size <= 0 || object.size > MAX_PRIVATE_BYTES) {
    throw new NativeEditionSelectionError('NATIVE_EDITION_ARTIFACT_UNAVAILABLE');
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await object.arrayBuffer();
  } catch {
    throw new NativeEditionSelectionError('NATIVE_EDITION_ARTIFACT_UNAVAILABLE');
  }
  if (bytes.byteLength !== object.size || bytes.byteLength > MAX_PRIVATE_BYTES) {
    throw new NativeEditionSelectionError('NATIVE_EDITION_ARTIFACT_SIZE_MISMATCH');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2,'0')).join('');
  if (hash !== edition.artifact_sha256) {
    throw new NativeEditionSelectionError('NATIVE_EDITION_ARTIFACT_HASH_MISMATCH');
  }
  let artifact: unknown;
  try {
    artifact = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes));
    const verified = validateNativeCourseArtifact(artifact);
    if (verified.packageVersion !== edition.package_version) {
      throw new Error('version mismatch');
    }
  } catch {
    throw new NativeEditionSelectionError('NATIVE_EDITION_ARTIFACT_INVALID');
  }
  return edition.id;
}
