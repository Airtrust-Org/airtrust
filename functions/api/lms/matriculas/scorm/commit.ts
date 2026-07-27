import { proxyStagingScormRequest } from '../../../../_lib/scorm-staging-proxy';

export const onRequestPost = (ctx: { request: Request; env: Record<string, unknown> }) =>
  proxyStagingScormRequest(ctx.request, ctx.env);
