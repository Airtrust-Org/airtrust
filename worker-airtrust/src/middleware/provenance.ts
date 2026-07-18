import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import {
  getCanonicalBuildTime,
  getCanonicalVersion,
  getWorkerVersionMetadata,
} from '../routes/system';

/**
 * Identifies the exact deployed Worker on every response. This deliberately
 * reads Cloudflare's version metadata binding rather than request cf fields.
 */
export function provenanceHeadersMiddleware(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();

    const worker = getWorkerVersionMetadata(c.env);
    c.header('X-AirTrust-App-Version', getCanonicalVersion(c.env));
    c.header('X-AirTrust-Environment', c.env.ENVIRONMENT || 'development');

    if (worker.id) c.header('X-AirTrust-Worker-Version', worker.id);
    if (worker.tag) c.header('X-AirTrust-Deployment-Tag', worker.tag);

    const buildTime = getCanonicalBuildTime(c.env);
    if (buildTime) c.header('X-AirTrust-Build-Time', buildTime);
  };
}
