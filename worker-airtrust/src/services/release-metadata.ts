import type { Env } from '../types';

const INVALID_DEPLOY_METADATA = new Set([
  '',
  'managed-by-script',
  '__build_version__',
  '__app_version__',
  'null',
  'undefined',
  'unknown',
]);

function sanitizeDeployMetadata(value: string | undefined | null): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (INVALID_DEPLOY_METADATA.has(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

export function getReleaseMetadata(env: Env) {
  const environment = String(env.ENVIRONMENT || '').trim().toLowerCase() || 'development';
  
  let version = sanitizeDeployMetadata(env.APP_VERSION) || sanitizeDeployMetadata(env.CF_DEPLOYMENT_ID);
  
  if (!version) {
    if (environment === 'staging' || environment === 'production') {
      version = 'unversioned-remote';
    } else {
      version = 'dev-local';
    }
  }

  const workerVersionId = sanitizeDeployMetadata(env.CF_VERSION_METADATA?.id);
  const deploymentTag = sanitizeDeployMetadata(env.CF_VERSION_METADATA?.tag);
  const workerVersionCreatedAt = sanitizeDeployMetadata(env.CF_VERSION_METADATA?.timestamp);

  const sourceSha = sanitizeDeployMetadata(env.AIRTRUST_SOURCE_SHA);
  const sourceTree = sanitizeDeployMetadata(env.AIRTRUST_SOURCE_TREE);
  const workerBundleSha256 = sanitizeDeployMetadata(env.AIRTRUST_WORKER_BUNDLE_SHA256);
  const releaseManifestSha256 = sanitizeDeployMetadata(env.AIRTRUST_RELEASE_MANIFEST_SHA256);

  const rawBuildTime = sanitizeDeployMetadata(env.APP_BUILD_TIME);
  const buildTime = environment === 'development' ? new Date().toISOString() : rawBuildTime;

  return {
    version,
    environment,
    sourceSha,
    workerVersionId,
    deploymentTag,
    workerVersionCreatedAt,
    sourceTree,
    workerBundleSha256,
    releaseManifestSha256,
    buildTime,
  };
}
