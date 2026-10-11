/**
 * Native V1 learner media reader. Exact tenant/enrollment/cycle/edition and
 * private authoring artifact are validated before selecting a media key.
 * The request may supply ONLY an asset ID from the validated course.
 *
 * Staging pilot only: full-byte SHA-256 verification requires bounded memory.
 * Larger videos need an independently reviewed streaming/range design.
 */
import {
  loadNativePublishedCourse, NativeContentLoadError,
} from './lms-native-content-loader';

export type NativeVerifiedAsset = {
  bytes: ArrayBuffer;
  contentType: string;
};

const ASSET_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_ASSET_BYTES = 12 * 1024 * 1024;

async function hashBytes(bytes: ArrayBuffer) {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export async function loadNativeVerifiedAsset(params: {
  db: D1Database;
  bucket: R2Bucket;
  empresaId: number;
  matriculaId: number;
  actorUserId: number;
  assetId: string;
}): Promise<NativeVerifiedAsset> {
  if (!ASSET_ID.test(params.assetId)) {
    throw new NativeContentLoadError('NATIVE_ASSET_INVALID_ID');
  }
  const published = await loadNativePublishedCourse(params);
  const asset = published.course.assets.find((item) => item.id === params.assetId);
  if (!asset || !published.course.units.some((unit) =>
    unit.blocks.some((block) => ('assetId' in block) && block.assetId === asset.id)
  )) {
    throw new NativeContentLoadError('NATIVE_ASSET_NOT_REFERENCED');
  }
  if (!DIGEST.test(asset.sha256)) {
    throw new NativeContentLoadError('NATIVE_ASSET_INVALID_HASH');
  }
  // The NativeCourse V1 validator has already rejected absolute paths,
  // external URLs, traversal and unknown MIME classes.
  const prefix = `lms/native/${params.empresaId}/${published.course.courseId}/`;
  // Asset R2 hierarchy uses numeric course IDs, NOT the content's courseId.
  const r2Prefix = `lms/native/${params.empresaId}/${published.courseIdNumeric}/${published.editionHash}/`;
  const object = await params.bucket.get(r2Prefix + asset.path);
  if (!object || object.size <= 0 || object.size > MAX_ASSET_BYTES) {
    throw new NativeContentLoadError('NATIVE_ASSET_MISSING_OR_TOO_LARGE');
  }
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength !== object.size || bytes.byteLength > MAX_ASSET_BYTES ||
      (await hashBytes(bytes)) !== asset.sha256) {
    throw new NativeContentLoadError('NATIVE_ASSET_INTEGRITY_FAILED');
  }
  return { bytes, contentType: asset.mime };
}
