import { proxyStagingScormRequest } from '../../../_lib/scorm-staging-proxy';

export const onRequest = (ctx: { request: Request; env: Record<string, unknown> }) =>
  proxyStagingScormRequest(ctx.request, ctx.env);
