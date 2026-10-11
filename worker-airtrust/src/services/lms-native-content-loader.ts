/**
 * Read-only Native course loader. NEVER serves the private authoring JSON
 * directly: it contains answer keys. R2 content MUST match the immutable
 * edition's exact byte digest before any learner projection is returned.
 *
 * This service is not an enrollment launcher and performs no writes. Future
 * API integration must first run canonical auth, admission and Schema V2.
 */
import {
  toNativeLearnerCourse,
  validateNativeCourseArtifact,
  type NativeLearnerCourse,
} from '../lib/lms/lms-native-course-contract';
import {
  resolveNativeEnrollmentAdmission,
  type NativeAdmission,
} from './lms-native-enrollment-access';

export class NativeContentLoadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeContentLoadError';
  }
}

type NativeEditionRow = {
  artifact_sha256: string;
  package_version: string;
  r2_prefix: string;
  ciclo_id: number;
};
const HASH = /^[a-f0-9]{64}$/;
const VERSION = /^n-[a-f0-9]{32}$/;
const MAX_NATIVE_JSON_BYTES = 4 * 1024 * 1024;

export type NativePublishedCourse = {
  course: NativeLearnerCourse;
  editionHash: string;
  cicloId: number;
  mode: NativeAdmission['mode'];
};

function reject(code: string): never {
  throw new NativeContentLoadError(code);
}

async function sha256Hex(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read after canonical auth; never accept empresaId/userId from request body. */
export async function loadNativePublishedCourse(params: {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  matriculaId: number;
  actorUserId: number;
}): Promise<NativePublishedCourse> {
  const admission = await resolveNativeEnrollmentAdmission({
    db: params.db,
    empresaId: params.empresaId,
    matriculaId: params.matriculaId,
    actorUserId: params.actorUserId,
  });

  // The enrollment/cycle/edition pin is the sole source of package selection.
  // Never list the bucket or fall back to "latest" on a missing asset.
  const row = await params.db.prepare([
    'SELECT ed.artifact_sha256, ed.package_version, ed.r2_prefix, b.ciclo_id',
    'FROM lms_native_matricula_edicoes b',
    'JOIN lms_native_edicoes ed ON ed.id=b.edicao_id',
    'AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id',
    'JOIN lms_matricula_ciclos cycle ON cycle.id=b.ciclo_id',
    'AND cycle.matricula_id=b.matricula_id AND cycle.empresa_id=b.empresa_id',
    'AND cycle.curso_id=b.curso_id AND cycle.deleted_at IS NULL AND cycle.ciclo_atual=1',
    'WHERE b.empresa_id=? AND b.matricula_id=? AND b.curso_id=?',
    "AND ed.status='PUBLISHED'",
    'LIMIT 1',
  ].join(' ')).bind(
    admission.empresaId, admission.matriculaId, admission.cursoId,
  ).first<NativeEditionRow>();

  if (!row || !Number.isSafeInteger(row.ciclo_id) || row.ciclo_id <= 0) {
    reject('NATIVE_EDITION_PIN_NOT_FOUND');
  }
  if (!HASH.test(row.artifact_sha256) || !VERSION.test(row.package_version)) {
    reject('NATIVE_INVALID_PUBLISHED_EDITION');
  }
  // Strict tenant/course/hash partition even when an R2 prefix was inserted
  // outside the trusted publication service.
  const expectedPrefix = `lms/native/${admission.empresaId}/${admission.cursoId}/${row.artifact_sha256}/`;
  if (row.r2_prefix !== expectedPrefix) {
    reject('NATIVE_EDITION_R2_SCOPE_INVALID');
  }
  const object = await params.bucket.get(expectedPrefix + 'native-private-candidate.json');
  if (!object || object.size <= 0 || object.size > MAX_NATIVE_JSON_BYTES) {
    reject('NATIVE_PUBLISHED_ARTIFACT_UNAVAILABLE');
  }
  const buffer = await object.arrayBuffer();
  if (buffer.byteLength !== object.size || buffer.byteLength > MAX_NATIVE_JSON_BYTES) {
    reject('NATIVE_PUBLISHED_ARTIFACT_SIZE_MISMATCH');
  }
  if ((await sha256Hex(buffer)) !== row.artifact_sha256) {
    reject('NATIVE_PUBLISHED_ARTIFACT_HASH_MISMATCH');
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer));
  } catch {
    reject('NATIVE_PUBLISHED_ARTIFACT_INVALID_JSON');
  }
  let artifact;
  try {
    artifact = validateNativeCourseArtifact(candidate);
  } catch {
    reject('NATIVE_PUBLISHED_ARTIFACT_INVALID_SCHEMA');
  }
  if (artifact.packageVersion !== row.package_version) {
    reject('NATIVE_PUBLISHED_EDITION_VERSION_MISMATCH');
  }
  // Authoring answer keys remain server-side; only the safe learner projection
  // leaves this function, never artifact or raw R2 bytes.
  return {
    course: toNativeLearnerCourse(artifact),
    editionHash: row.artifact_sha256,
    cicloId: row.ciclo_id,
    mode: admission.mode,
  };
}
