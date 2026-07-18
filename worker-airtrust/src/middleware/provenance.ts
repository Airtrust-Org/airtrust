import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import {
  getCanonicalBuildTime,
  getCanonicalVersion,
  getProvenanceChain,
  getWorkerVersionMetadata,
} from '../routes/system';

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

    const worker = getWorkerVersionMetadata(c.env);
    const provenance = getProvenanceChain(c.env);

    c.header('X-AirTrust-App-Version', getCanonicalVersion(c.env));
    c.header('X-AirTrust-Environment', c.env.ENVIRONMENT || 'development');

    if (worker.id) c.header('X-AirTrust-Worker-Version', worker.id);
    if (worker.tag) c.header('X-AirTrust-Deployment-Tag', worker.tag);

    const buildTime = getCanonicalBuildTime(c.env);
    if (buildTime) c.header('X-AirTrust-Build-Time', buildTime);

    if (provenance.sourceSha) c.header('X-AirTrust-Source-SHA', provenance.sourceSha);
    if (provenance.sourceTree) c.header('X-AirTrust-Source-Tree', provenance.sourceTree);
    if (provenance.workerBundleSha256) {
      c.header('X-AirTrust-Worker-Bundle-SHA256', provenance.workerBundleSha256);
    }
    if (provenance.releaseManifestSha256) {
      c.header('X-AirTrust-Release-Manifest-SHA256', provenance.releaseManifestSha256);
    }
  };
}
