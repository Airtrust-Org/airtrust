import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { getReleaseMetadata } from '../services/release-metadata';

/**
 * Identifies the exact deployed Worker on every response — including 404s
 * and errors, since this runs after next() regardless of status. This
 * deliberately reads Cloudflare's version metadata binding rather than
 * request cf fields (cf.colo identifies a datacenter, not a Worker version).
 *
 * X-AirTrust-Worker-Version is Cloudflare's own runtime identity for this
 * Worker Version. X-AirTrust-Source-SHA/-Source-Tree/-Worker-Bundle-SHA256/
 * -Release-Manifest-SHA256 are claims made by the deploy pipeline that BUILT
 * the bundle, not a Cloudflare-side cryptographic proof that these bytes
 * produced this exact runtime — see docs/ops/STAGING_RUNTIME_FORENSICS_2026-07-18.md
 * for the exact evidence classification.
 */
export function provenanceHeadersMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    const metadata = getReleaseMetadata(c.env);

    c.header('X-AirTrust-App-Version', metadata.version);
    c.header('X-AirTrust-Environment', metadata.environment);

    if (metadata.workerVersionId) c.header('X-AirTrust-Worker-Version', metadata.workerVersionId);
    if (metadata.deploymentTag) c.header('X-AirTrust-Deployment-Tag', metadata.deploymentTag);

    if (metadata.buildTime) c.header('X-AirTrust-Build-Time', metadata.buildTime);

    if (metadata.sourceSha) c.header('X-AirTrust-Source-SHA', metadata.sourceSha);
    if (metadata.sourceTree) c.header('X-AirTrust-Source-Tree', metadata.sourceTree);
    if (metadata.workerBundleSha256) {
      c.header('X-AirTrust-Worker-Bundle-SHA256', metadata.workerBundleSha256);
    }
    if (metadata.releaseManifestSha256) {
      c.header('X-AirTrust-Release-Manifest-SHA256', metadata.releaseManifestSha256);
    }
  };
}
