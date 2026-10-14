/**
 * Front D preflight is pure, fail-closed, and never reads credentials or
 * touches a remote environment. It validates TEST-ONLY staging identities.
 */
export type QaChoice = { question: string; wrong: string; correct: string };
export type QaUnit = {
  id: string; kind: 'lesson'|'assessment'; lessonId?: string; visualCue: string;
  practice?: QaChoice;
  official?: { stageId: string; questions: QaChoice[] };
};
export type QaEnrollment = {
  launchPath: string; snapshotPath: string; editionSha256: string;
  enrollmentId: number; cycleId: number;
};
export type QaDoutrinamento = QaEnrollment & {
  units: QaUnit[]; requiredLessonIds: string[];
  qualificationPath: string; certificatePath: string;
};
export type QaResume80 = QaEnrollment & {
  expectedResumeUnitId: string; creditedNavigationIds: string[];
  minPreviousPct: number;
};
export type QaExternal = QaEnrollment & {
  frameSelectors: string[];
  visualLastPageButton: string; wrongAnswerButton: string;
  correctAnswerButton: string; submitButton: string; finishButton: string;
  learnerCompletionButton: string;
  scormSnapshotPath: string;
};
export type QaProjectFixture = {
  doutrinamento: QaDoutrinamento; resume80: QaResume80; external: QaExternal;
};
export type QaProfile = {
  baseUrl: string; apiBaseUrl: string; contentOrigin: string;
  expectedSourceSha: string; empresaId: number;
  courseTitle: string; projects: Record<string, QaProjectFixture>;
};
const hex = /^[a-f0-9]{64}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const originPattern = /^https:\/\//;

export function requireQa(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error('PLAYER3_CONTRACT_MISSING:' + code);
}
export function qaPath(origin: string, path: string): string {
  requireQa(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'),
    'RELATIVE_API_OR_LAUNCH_PATH');
  requireQa(!path.includes('..') && !path.includes('\\') && !path.includes(String.fromCharCode(0)) &&
    !/%(?:2e|2f|5c|00)/i.test(path), 'UNSAFE_RELATIVE_PATH');
  const url = new URL(path, origin);
  requireQa(url.origin === origin && !url.username && !url.password,
    'CROSS_ORIGIN_PATH');
  requireQa(!url.hash && ![...url.searchParams.keys()].some(key=>
    /(?:token|secret|auth|signature|signed|api[_-]?key|session|jwt)/i.test(key)),
    'NO_CREDENTIALS_IN_URL');
  return url.href;
}
function qaChoice(x: QaChoice): boolean {
  return !!x && [x.question,x.wrong,x.correct].every(
    s => typeof s === 'string' && s.trim().length > 0 &&
      s.length <= 400) && x.wrong !== x.correct;
}
function qaEnrollment(x: QaEnrollment, appOrigin: string, apiOrigin: string): boolean {
  if (!x || !Number.isSafeInteger(x.enrollmentId) || x.enrollmentId <= 0 ||
    !Number.isSafeInteger(x.cycleId) || x.cycleId <= 0 || !hex.test(x.editionSha256)) return false;
  qaPath(appOrigin, x.launchPath);
  qaPath(apiOrigin, x.snapshotPath);
  return true;
}
export function validateQaProfile(raw: unknown, projectName: string,
  approvedStagingOrigin: string, approvedApiOrigin: string,
  approvedSyntheticTenantId: string, approvedContentOrigin: string): {
    profile: QaProfile; fixture: QaProjectFixture;
  } {
  const data = raw as QaProfile;
  requireQa(!!data && typeof data.baseUrl === 'string', 'PRIVATE_QA_PROFILE');
  let origin: URL;
  try { origin = new URL(data.baseUrl); }
  catch { throw Error('PLAYER3_CONTRACT_MISSING:HTTPS_STAGING_ORIGIN'); }
  requireQa(originPattern.test(data.baseUrl) && data.baseUrl === origin.origin &&
    !origin.username && !origin.password && !origin.search && !origin.hash,
    'HTTPS_STAGING_ORIGIN');
  const host = origin.hostname.toLowerCase();
  requireQa(host !== 'airtrust.online' && host !== 'www.airtrust.online',
    'PRODUCTION_FORBIDDEN');
  requireQa(/staging|stage|qa/.test(host), 'EXPLICIT_STAGING_HOST_REQUIRED');
  requireQa(approvedStagingOrigin === origin.origin, 'STAGING_ORIGIN_ALLOWLIST');
  let api: URL;
  try { api = new URL(data.apiBaseUrl); }
  catch { throw Error('PLAYER3_CONTRACT_MISSING:HTTPS_STAGING_API_ORIGIN'); }
  requireQa(data.apiBaseUrl === api.origin && api.protocol === 'https:' &&
    /staging|stage|qa/.test(api.hostname) &&
    !['airtrust.online','www.airtrust.online','api.airtrust.online'].includes(api.hostname) &&
    api.origin !== origin.origin, 'HTTPS_STAGING_API_ORIGIN');
  requireQa(approvedApiOrigin === api.origin, 'STAGING_API_ORIGIN_ALLOWLIST');
  requireQa(/^[a-f0-9]{40}$/.test(data.expectedSourceSha),
    'PINNED_WORKER_SOURCE_SHA');
  requireQa(Number.isSafeInteger(data.empresaId) && data.empresaId > 0, 'TENANT_ID');
  requireQa(/^[1-9][0-9]{0,15}$/.test(approvedSyntheticTenantId) &&
    String(data.empresaId)===approvedSyntheticTenantId,
    'SYNTHETIC_TENANT_ALLOWLIST');
  requireQa(typeof data.courseTitle === 'string' && data.courseTitle.trim().length > 0,
    'ORIGINAL_COURSE_TITLE');
  let assetOrigin: URL;
  try { assetOrigin = new URL(data.contentOrigin); }
  catch { throw Error('PLAYER3_CONTRACT_MISSING:ISOLATED_HTML5_CONTENT_ORIGIN'); }
  requireQa(assetOrigin.protocol === 'https:' &&
    data.contentOrigin === assetOrigin.origin &&
    /staging|stage|qa/.test(assetOrigin.hostname) &&
    !['airtrust.online','www.airtrust.online','api.airtrust.online'].includes(assetOrigin.hostname) &&
    assetOrigin.origin !== origin.origin && assetOrigin.origin !== api.origin,
    'ISOLATED_HTML5_CONTENT_ORIGIN');
  requireQa(approvedContentOrigin===assetOrigin.origin,
    'ISOLATED_CONTENT_ORIGIN_ALLOWLIST');
  requireQa(data.projects && data.projects.chromium && data.projects.webkit,
    'BOTH_INDEPENDENT_BROWSER_PROJECTS');
  // Every browser gets its own writeable enrollments and repeatable timeline.
  const enrollmentIds: number[] = [];
  for (const name of ['chromium','webkit']) {
    const f = data.projects[name];
    requireQa(!!f && !!f.doutrinamento && !!f.resume80 && !!f.external,
      'PROJECT_FIXTURE_' + name);
    for (const x of [f.doutrinamento,f.resume80,f.external]) {
      requireQa(qaEnrollment(x,origin.origin,api.origin), 'SYNTHETIC_ENROLLMENT_IDENTITIES');
      enrollmentIds.push(x.enrollmentId);
    }
    const d = f.doutrinamento;
    requireQa(Array.isArray(d.units) && d.units.length === 42 &&
      new Set(d.units.map(u => u?.id)).size === 42, 'DOU_RC81_42_UNITS');
    requireQa(d.units.every(u => !!u && id.test(u.id) &&
      (u.kind==='lesson'||u.kind==='assessment') &&
      typeof u.visualCue === 'string' && u.visualCue.trim().length > 0 &&
      (u.lessonId===undefined || id.test(u.lessonId)) &&
      (!u.practice || qaChoice(u.practice)) &&
      (!u.official || (id.test(u.official.stageId) &&
        Array.isArray(u.official.questions) && u.official.questions.length > 0 &&
        u.official.questions.every(qaChoice)))),
    'AUTHOR_UNIT_AND_EXAM_MAP');
    const official = d.units.flatMap(u => u.official ? [u.official.stageId] : []);
    requireQa(official.length === 8 && new Set(official).size === 8,
      'DOU_RC81_EIGHT_MODULAR_ASSESSMENTS');
    const mappedLessons=d.units.flatMap(u=>u.lessonId?[u.lessonId]:[]);
    requireQa(Array.isArray(d.requiredLessonIds) &&
      d.requiredLessonIds.length>0 && d.requiredLessonIds.length<=500 &&
      d.requiredLessonIds.every(s=>id.test(s)) &&
      new Set(d.requiredLessonIds).size===d.requiredLessonIds.length &&
      mappedLessons.length===new Set(mappedLessons).size &&
      mappedLessons.length===d.requiredLessonIds.length &&
      mappedLessons.every(s=>d.requiredLessonIds.includes(s)),
      'REVIEWED_CANONICAL_LESSON_CROSSWALK');
    requireQa(d.units.some(u => u.practice), 'FORMATIVE_GATE_REQUIRED');
    qaPath(api.origin, d.qualificationPath);
    qaPath(api.origin, d.certificatePath);
    const r = f.resume80;
    requireQa(Number.isInteger(r.minPreviousPct) && r.minPreviousPct >= 80 &&
      r.minPreviousPct < 100, 'SOURCE_80_PERCENT_BASELINE');
    requireQa(id.test(r.expectedResumeUnitId) &&
      Array.isArray(r.creditedNavigationIds) && r.creditedNavigationIds.length > 0 &&
      r.creditedNavigationIds.every(u => id.test(u)),
      'REVIEWED_CREDIT_IDS');
    const e = f.external;
    requireQa(Array.isArray(e.frameSelectors) && e.frameSelectors.length > 0 &&
      e.frameSelectors.every(s => typeof s === 'string' && s.length > 0) &&
      [e.visualLastPageButton,e.wrongAnswerButton,e.correctAnswerButton,
        e.submitButton,e.finishButton,e.learnerCompletionButton].every(s => typeof s === 'string' && s.trim().length > 0),
      'SCORM_EXTERNAL_CONTROLS');
    qaPath(api.origin, e.scormSnapshotPath);
  }
  requireQa(new Set(enrollmentIds).size === 6, 'DEDICATED_PER_BROWSER_ENROLLMENTS');
  requireQa(!!data.projects[projectName], 'PROJECT_FIXTURE_' + projectName);
  return {profile:data,fixture:data.projects[projectName]};
}

/**
 * Read-only Player3 projections must never expose learner answer selections,
 * grading keys, answer hashes, or private instructor explanations. The caller
 * receives real Worker JSON; unknown nested properties are scanned, not
 * silently dropped by a TypeScript type assertion.
 */
export function assertQaReadOnlyNonDisclosure(raw: unknown): void {
  let serialized: string | undefined;
  try { serialized=JSON.stringify(raw); } catch {
    requireQa(false,'WORKER_READONLY_DATA_INVALID');
  }
  requireQa(typeof serialized==='string' && serialized.length>0 &&
    serialized.length<=128*1024,'WORKER_READONLY_DATA_BOUNDED');
  const privateKey=/"(?:answers|answers_json|answersJson|answers_sha256|answersSha256|correctOptionId|correct_option_id|correctAnswers|answerKey|serverPrivateBank|privateBank|feedbackCorrect|feedbackIncorrect|gabarito|solution|questionId|optionId)"\s*:/i;
  requireQa(!privateKey.test(serialized!) &&
    !/player3-server-private-bank\.json/i.test(serialized!),
    'WORKER_READONLY_PRIVATE_MATERIAL_LEAK');
}

/**
 * Read-only, backend-regraded module session from Front B's exact endpoint.
 * Never infer certification or progress from this advisory/session projection.
 */
export type QaModuleStage = {
  stageId: string; attempts: number; lastScorePct: number | null;
  passed: boolean; nextAttemptNumber: number | null;
};
export type QaModuleSession = {
  editionSha256: string; cycleId: number;
  allOfficialStagesPassed: boolean; completionSupported: boolean;
  stages: QaModuleStage[];
};
export function validateQaModuleSession(raw: unknown, edition: string,
  cycle: number, requiredStages: readonly string[]): QaModuleSession {
  assertQaReadOnlyNonDisclosure(raw);
  const s=raw as QaModuleSession;
  requireQa(!!s && s.editionSha256===edition && s.cycleId===cycle,
    'MODULE_SESSION_PINNED_EDITION_CYCLE');
  requireQa(Array.isArray(s.stages) && s.stages.length===requiredStages.length &&
    requiredStages.length>0 && new Set(requiredStages).size===requiredStages.length,
    'MODULE_SESSION_STAGE_COUNT');
  const actual=new Set<string>();
  for(const stage of s.stages) {
    requireQa(!!stage && typeof stage.stageId==='string' && id.test(stage.stageId) &&
      !actual.has(stage.stageId), 'MODULE_SESSION_STAGE_ID');
    actual.add(stage.stageId);
    const attempts=stage.attempts;
    requireQa(Number.isSafeInteger(attempts) && attempts>=0 && attempts<=500 &&
      typeof stage.passed==='boolean' &&
      (stage.lastScorePct===null ||
        (Number.isInteger(stage.lastScorePct) &&
        stage.lastScorePct>=0 && stage.lastScorePct<=100)) &&
      (attempts===0
        ? !stage.passed && stage.lastScorePct===null && stage.nextAttemptNumber===1
        : stage.lastScorePct!==null &&
          stage.nextAttemptNumber===(attempts<500?attempts+1:null)),
      'MODULE_SESSION_ATTEMPT_INTEGRITY');
  }
  requireQa(requiredStages.every(stage=>actual.has(stage)),
    'MODULE_SESSION_POLICY_STAGE_MISMATCH');
  requireQa(typeof s.allOfficialStagesPassed==='boolean' &&
    s.allOfficialStagesPassed===s.stages.every(stage=>stage.passed) &&
    typeof s.completionSupported==='boolean', 'MODULE_SESSION_NO_PREMATURE_COMPLETION');
  return s;
}

/**
 * Front B's combined *read-only* content/module readiness projection.
 * The double camel/snake completion fields are returned by the actual route.
 * Neither a ready verdict nor 42/42 and 8/8 certifies the student.
 */
export type QaJointReadiness = {
  matricula_id: number; editionSha256: string; cycleId: number;
  totalRequiredLessons: number; verifiedLessons: number;
  officialStageCount: number; officialStagesPassed: number;
  readyForAtomicTerminalPreflight: boolean;
  reason: 'READY_FOR_TERMINAL_PREFLIGHT'|'EDITION_OR_CYCLE_MISMATCH'|
    'INVALID_EVIDENCE'|'CONTENT_NOT_FINISHED'|'OFFICIAL_STAGES_NOT_PASSED'|
    'REVIEW_READ_ONLY';
  completionSupported: false; completion_supported: false;
};
const readinessReasons=new Set([
  'READY_FOR_TERMINAL_PREFLIGHT','EDITION_OR_CYCLE_MISMATCH',
  'INVALID_EVIDENCE','CONTENT_NOT_FINISHED',
  'OFFICIAL_STAGES_NOT_PASSED','REVIEW_READ_ONLY',
]);
export function validateQaJointReadiness(raw: unknown, enrollment: QaEnrollment,
  requiredLessons: number, requiredStages: number): QaJointReadiness {
  assertQaReadOnlyNonDisclosure(raw);
  const r=raw as QaJointReadiness;
  requireQa(!!r && r.matricula_id===enrollment.enrollmentId &&
    r.editionSha256===enrollment.editionSha256 &&
    r.cycleId===enrollment.cycleId, 'JOINT_READINESS_PINNED_ENROLLMENT_EDITION_CYCLE');
  requireQa([r.totalRequiredLessons,r.verifiedLessons,
    r.officialStageCount,r.officialStagesPassed].every(n=>
      Number.isSafeInteger(n) && n>=0) &&
    r.totalRequiredLessons===requiredLessons &&
    r.officialStageCount===requiredStages &&
    r.verifiedLessons<=r.totalRequiredLessons &&
    r.officialStagesPassed<=r.officialStageCount,
    'JOINT_READINESS_CONTENT_STAGE_COUNTS');
  requireQa(typeof r.readyForAtomicTerminalPreflight==='boolean' &&
    readinessReasons.has(r.reason) &&
    r.readyForAtomicTerminalPreflight===
      (r.reason==='READY_FOR_TERMINAL_PREFLIGHT') &&
    (!r.readyForAtomicTerminalPreflight ||
      (r.verifiedLessons===r.totalRequiredLessons &&
       r.officialStagesPassed===r.officialStageCount)),
    'JOINT_READINESS_REASON_AND_EVIDENCE');
  requireQa(r.completionSupported===false && r.completion_supported===false,
    'JOINT_READINESS_NEVER_CERTIFIES');
  return r;
}

/**
 * A 200 OK response or a five-byte %PDF- prefix is not proof of an issued
 * certificate. Check MIME, bounded complete document and terminal cross-ref.
 * The E2E separately verifies canonical qualification/certificate IDs.
 */
export function validateQaCertificatePdf(raw: Uint8Array, contentType: string): void {
  requireQa(typeof contentType==='string' &&
    contentType.split(';')[0].trim().toLowerCase()==='application/pdf',
    'CERTIFICATE_PDF_CONTENT_TYPE');
  requireQa(raw instanceof Uint8Array && raw.byteLength>=1024 &&
    raw.byteLength<=25*1024*1024, 'CERTIFICATE_PDF_SIZE');
  const header=new TextDecoder('latin1').decode(raw.subarray(0,16));
  const trailer=new TextDecoder('latin1').decode(raw.subarray(Math.max(0,raw.length-2048)));
  requireQa(/^%PDF-(?:1\.[0-7]|2\.0)(?:\r?\n|\r)/.test(header) &&
    /startxref\s+\d+\s+%%EOF\s*$/.test(trailer),
    'CERTIFICATE_PDF_STRUCTURE');
}
