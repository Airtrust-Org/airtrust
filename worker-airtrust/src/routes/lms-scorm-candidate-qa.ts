import { Hono } from 'hono';
import { ApiError } from '../middleware/error-handler';
import { assertCandidateQaScope, assertScormCandidateQaEnvironment, readScormQaCandidate } from '../lib/lms/lms-scorm-candidate-preview';
import { readF0CandidateRuntimeState, witnessF0CandidateLaunch, commitF0CandidateSuspend } from '../lib/lms/lms-scorm-f0-staging-runtime';
import type { Env, JwtPayload } from '../types';

/** Register staging-only candidate preview routes without expanding the LMS god-file. */
export function registerScormCandidateQaRoutes(
  app: Hono<{ Bindings: Env }>,
  deps: {
    authenticateLmsAssetRequest: (env: Env, request: Request) => Promise<JwtPayload>;
    isPreviewAllowedRole: (role: unknown) => boolean;
    ensureCourseAssetAccess: (db: D1Database, payload: JwtPayload, empresaId: number, cursoId: number) => Promise<unknown>;
    extractAssetPathFromRequest: (pathname: string, prefix: string) => string;
    resolveScormObject: (
      bucket: R2Bucket, empresaId: string | number, cursoId: string | number,
      wildcard: string, options: { activePrefix?: string | null },
    ) => Promise<{ object: R2ObjectBody | null; resolvedKey: string }>;
    guessMime: (path: string) => string;
    buildAssetHeaders: (corsOrigins: string | undefined, origin: string | undefined, type: string) => Headers;
    resolveScormLaunchFile: (
      bucket: R2Bucket, empresaId: string | number, cursoId: string | number,
      file: string, options: { activePrefix?: string | null },
    ) => Promise<string | null>;
    buildLaunchPage: (config: {
      matriculaId: number | null; titulo: string; launchUrl: string; commitUrl: string | null;
      token: string; isScorm2004: boolean; previewMode: boolean; assetCacheBuster: string;
      cicloId?: number; numeroCiclo?: number; initialCmiJson?: string; hasResumeState?: boolean;
    }) => string;
    buildProtectedLaunchHeaders: (corsOrigins: string | undefined, origin: string | undefined) => Headers;
  },
): void {
  const {
    authenticateLmsAssetRequest, isPreviewAllowedRole, ensureCourseAssetAccess,
    extractAssetPathFromRequest, resolveScormObject, guessMime, buildAssetHeaders,
    resolveScormLaunchFile, buildLaunchPage, buildProtectedLaunchHeaders,
  } = deps;
  app.get('/scorm/qa-assets/:empresa_id/:curso_id/:candidate_id/*', async (c) => {
    assertScormCandidateQaEnvironment(c.env.ENVIRONMENT);
    const payload = (await authenticateLmsAssetRequest(c.env, c.req.raw)) as JwtPayload & {
      asset_qa_candidate_id?: string;
      asset_qa_candidate_sha256?: string;
    };
    const empresaId = Number(c.req.param('empresa_id'));
    const cursoId = Number(c.req.param('curso_id'));
    if (!isPreviewAllowedRole(payload.role)) throw new ApiError('QA negado', 403);
    const candidate = await readScormQaCandidate(c.env.DB, {
      empresaId, cursoId, packageId: c.req.param('candidate_id'),
    });
    assertCandidateQaScope(payload, { empresaId, cursoId, candidate });
    await ensureCourseAssetAccess(c.env.DB, payload, empresaId, cursoId);
    const wildcard = extractAssetPathFromRequest(new URL(c.req.url).pathname,
      `/api/lms/scorm/qa-assets/${empresaId}/${cursoId}/${candidate.id}`);
    const { object } = await resolveScormObject(c.env.BUCKET, empresaId, cursoId, wildcard,
      { activePrefix: candidate.r2_prefix });
    if (!object) return c.text('Not found', 404);
    const headers = buildAssetHeaders(c.env.CORS_ORIGINS, c.req.header('Origin'), guessMime(wildcard));
    headers.set('Cache-Control', 'private, no-store');
    return new Response(object.body, { status: 200, headers });
  });

  app.get('/scorm/qa-preview/:curso_id/:candidate_id', async (c) => {
    assertScormCandidateQaEnvironment(c.env.ENVIRONMENT);
    const payload = (await authenticateLmsAssetRequest(c.env, c.req.raw)) as JwtPayload & {
      asset_qa_candidate_id?: string;
      asset_qa_candidate_sha256?: string;
    };
    const empresaId = Number(payload.empresa_id ?? 0);
    const cursoId = Number(c.req.param('curso_id'));
    if (!isPreviewAllowedRole(payload.role)) throw new ApiError('QA negado', 403);
    const candidate = await readScormQaCandidate(c.env.DB, {
      empresaId, cursoId, packageId: c.req.param('candidate_id'),
    });
    assertCandidateQaScope(payload, { empresaId, cursoId, candidate });
    await ensureCourseAssetAccess(c.env.DB, payload, empresaId, cursoId);
    const launchFile = await resolveScormLaunchFile(c.env.BUCKET, empresaId, cursoId,
      candidate.launch_file, { activePrefix: candidate.r2_prefix });
    if (!launchFile) throw new ApiError('Launch da edição candidata não encontrado', 404);
    const launchUrl = `/api/lms/scorm/qa-assets/${empresaId}/${cursoId}/${candidate.id}/${launchFile}`;
    const html = buildLaunchPage({
      matriculaId: null, titulo: 'QA · edição candidata inativa',
      launchUrl, commitUrl: null, token: '',
      isScorm2004: candidate.scorm_versao === '2004', previewMode: true,
      assetCacheBuster: candidate.package_sha256.slice(0, 16),
    });
    return new Response(html, {
      status: 200, headers: buildProtectedLaunchHeaders(c.env.CORS_ORIGINS, c.req.header('Origin')),
    });
  });

  // Staging-only, inactive-candidate runtime for a governed synthetic F0
  // enrollment. This is a deliberately incomplete/suspend-only path and
  // cannot create course completion, grades or certificates.
  async function authorizedF0Context(c: Parameters<Parameters<typeof app.get>[1]>[0]) {
    if (c.env.ENVIRONMENT !== 'staging') throw new ApiError('F0 indisponível', 403);
    const payload = (await authenticateLmsAssetRequest(c.env,c.req.raw)) as JwtPayload & {
      asset_qa_candidate_id?:string; asset_qa_candidate_sha256?:string;
    };
    const tenantId=Number(payload.empresa_id ?? 0);
    const courseId=Number(c.req.param('curso_id'));
    const enrollmentId=Number(c.req.param('enrollment_id'));
    const authorizedTenant=Number(c.env.SCORM_QA_SYNTHETIC_TENANT_ID);
    if (!Number.isSafeInteger(authorizedTenant) || authorizedTenant<=0 ||
        tenantId!==authorizedTenant ||
        !Number.isSafeInteger(courseId) || courseId<=0 ||
        !Number.isSafeInteger(enrollmentId) || enrollmentId<=0 ||
        !['admin','administrador'].includes(String(payload.role??'').toLowerCase())) {
      throw new ApiError('SCORM_F0_SYNTHETIC_TENANT_OR_ADMIN_DENIED',403);
    }
    const candidate=await readScormQaCandidate(c.env.DB,{
      empresaId:tenantId,cursoId:courseId,
      packageId:c.req.param('candidate_id'),
    });
    assertCandidateQaScope(payload,{empresaId:tenantId,cursoId,candidate});
    await ensureCourseAssetAccess(c.env.DB,payload,tenantId,courseId);
    const scope={
      tenantId,courseId,enrollmentId,packageId:candidate.id,
      packageSha256:candidate.package_sha256,
      runtimeSha:c.env.AIRTRUST_SOURCE_SHA??'',
    };
    const binding=await readF0CandidateRuntimeState(c.env.DB,scope);
    return {candidate,scope,binding};
  }

  app.get('/scorm/qa-f0/launch/:curso_id/:candidate_id/:enrollment_id',async c=>{
    const {candidate,scope,binding}=await authorizedF0Context(c);
    const launchFile=await resolveScormLaunchFile(
      c.env.BUCKET,scope.tenantId,scope.courseId,
      candidate.launch_file,{activePrefix:candidate.r2_prefix},
    );
    if(!launchFile)throw new ApiError('SCORM_F0_CANDIDATE_ASSET_NOT_FOUND',404);
    await witnessF0CandidateLaunch(c.env.DB,scope,binding);
    const refreshed=await readF0CandidateRuntimeState(c.env.DB,scope);
    const launchUrl=`/api/lms/scorm/qa-assets/${scope.tenantId}/${scope.courseId}/${candidate.id}/${launchFile}`;
    const commitUrl=`/api/lms/scorm/qa-f0/commit/${scope.courseId}/${candidate.id}/${scope.enrollmentId}`;
    const html=buildLaunchPage({
      matriculaId:scope.enrollmentId,cicloId:refreshed.cycleId,
      titulo:'QA F0 · candidato sintético inativo',
      launchUrl,commitUrl,token:'',
      isScorm2004:candidate.scorm_versao==='2004',previewMode:false,
      initialCmiJson:refreshed.cmiJson??'{}',
      hasResumeState:Boolean(refreshed.suspendData),
      assetCacheBuster:candidate.package_sha256.slice(0,16),
    });
    return new Response(html,{
      status:200,headers:buildProtectedLaunchHeaders(c.env.CORS_ORIGINS,c.req.header('Origin')),
    });
  });

  app.post('/scorm/qa-f0/commit/:curso_id/:candidate_id/:enrollment_id',async c=>{
    const {scope}=await authorizedF0Context(c);
    const body=await c.req.json<unknown>().catch(()=>null);
    const committed=await commitF0CandidateSuspend(c.env.DB,scope,body);
    c.header('Cache-Control','private, no-store');
    return c.json({success:true,data:committed});
  });

}
