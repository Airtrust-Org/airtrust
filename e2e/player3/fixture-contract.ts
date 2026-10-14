/**
 * Front D preflight is pure, fail-closed, and never reads credentials or
 * touches a remote environment. It validates TEST-ONLY staging identities.
 */
export type QaChoice = Readonly<{ question: string; wrong: string; correct: string }>;
export type QaUnit = Readonly<{
  id: string; visualCue: string;
  practice?: QaChoice;
  official?: Readonly<{ stageId: string; questions: readonly QaChoice[] }>;
}>;
export type QaEnrollment = Readonly<{
  launchPath: string; snapshotPath: string; editionSha256: string;
  enrollmentId: number; cycleId: number;
}>;
export type QaDoutrinamento = QaEnrollment & Readonly<{
  units: readonly QaUnit[]; qualificationPath: string; certificatePath: string;
}>;
export type QaResume80 = QaEnrollment & Readonly<{
  expectedResumeUnitId: string; creditedNavigationIds: readonly string[];
  minPreviousPct: number;
}>;
export type QaExternal = QaEnrollment & Readonly<{
  frameSelectors: readonly string[];
  visualLastPageButton: string; wrongAnswerButton: string;
  correctAnswerButton: string; submitButton: string; finishButton: string;
  scormSnapshotPath: string;
}>;
export type QaProjectFixture = Readonly<{
  doutrinamento: QaDoutrinamento; resume80: QaResume80; external: QaExternal;
}>;
export type QaProfile = Readonly<{
  baseUrl: string; contentOrigin: string; empresaId: number;
  courseTitle: string; projects: Record<string, QaProjectFixture>;
}>;
const hex = /^[a-f0-9]{64}$/;
const id = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const originPattern = /^https:\/\//;

export function requireQa(ok: unknown, code: string): asserts ok {
  if (!ok) throw new Error('PLAYER3_CONTRACT_MISSING:' + code);
}
export function qaPath(origin: string, path: string): string {
  requireQa(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'),
    'RELATIVE_API_OR_LAUNCH_PATH');
  requireQa(!path.includes('..') && !/[\\\u0000]/.test(path) &&
    !/%(?:2e|2f|5c|00)/i.test(path), 'UNSAFE_RELATIVE_PATH');
  const url = new URL(path, origin);
  requireQa(url.origin === origin && !url.username && !url.password,
    'CROSS_ORIGIN_PATH');
  return url.href;
}
function qaChoice(x: QaChoice): boolean {
  return !!x && [x.question,x.wrong,x.correct].every(
    s => typeof s === 'string' && s.trim().length > 0 &&
      s.length <= 400) && x.wrong !== x.correct;
}
function qaEnrollment(x: QaEnrollment, origin: string): boolean {
  if (!x || !Number.isSafeInteger(x.enrollmentId) || x.enrollmentId <= 0 ||
    !Number.isSafeInteger(x.cycleId) || x.cycleId <= 0 || !hex.test(x.editionSha256)) return false;
  qaPath(origin, x.launchPath);
  qaPath(origin, x.snapshotPath);
  return true;
}
export function validateQaProfile(raw: unknown, projectName: string,
  approvedStagingOrigin: string): {profile: QaProfile; fixture: QaProjectFixture} {
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
  requireQa(Number.isSafeInteger(data.empresaId) && data.empresaId > 0, 'TENANT_ID');
  requireQa(typeof data.courseTitle === 'string' && data.courseTitle.trim().length > 0,
    'ORIGINAL_COURSE_TITLE');
  let assetOrigin: URL;
  try { assetOrigin = new URL(data.contentOrigin); }
  catch { throw Error('PLAYER3_CONTRACT_MISSING:ISOLATED_HTML5_CONTENT_ORIGIN'); }
  requireQa(assetOrigin.protocol === 'https:' &&
    data.contentOrigin === assetOrigin.origin && assetOrigin.origin !== origin.origin,
    'ISOLATED_HTML5_CONTENT_ORIGIN');
  requireQa(data.projects && data.projects.chromium && data.projects.webkit,
    'BOTH_INDEPENDENT_BROWSER_PROJECTS');
  // Every browser gets its own writeable enrollments and repeatable timeline.
  const enrollmentIds: number[] = [];
  for (const name of ['chromium','webkit']) {
    const f = data.projects[name];
    requireQa(!!f && !!f.doutrinamento && !!f.resume80 && !!f.external,
      'PROJECT_FIXTURE_' + name);
    for (const x of [f.doutrinamento,f.resume80,f.external]) {
      requireQa(qaEnrollment(x,origin.origin), 'SYNTHETIC_ENROLLMENT_IDENTITIES');
      enrollmentIds.push(x.enrollmentId);
    }
    const d = f.doutrinamento;
    requireQa(Array.isArray(d.units) && d.units.length === 42 &&
      new Set(d.units.map(u => u?.id)).size === 42, 'DOU_RC81_42_UNITS');
    requireQa(d.units.every(u => !!u && id.test(u.id) &&
      typeof u.visualCue === 'string' && u.visualCue.trim().length > 0 &&
      (!u.practice || qaChoice(u.practice)) &&
      (!u.official || (id.test(u.official.stageId) &&
        Array.isArray(u.official.questions) && u.official.questions.length > 0 &&
        u.official.questions.every(qaChoice)))),
    'AUTHOR_UNIT_AND_EXAM_MAP');
    const official = d.units.flatMap(u => u.official ? [u.official.stageId] : []);
    requireQa(official.length === 8 && new Set(official).size === 8,
      'DOU_RC81_EIGHT_MODULAR_ASSESSMENTS');
    requireQa(d.units.some(u => u.practice), 'FORMATIVE_GATE_REQUIRED');
    qaPath(origin.origin, d.qualificationPath);
    qaPath(origin.origin, d.certificatePath);
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
        e.submitButton,e.finishButton].every(s => typeof s === 'string' && s.trim().length > 0),
      'SCORM_EXTERNAL_CONTROLS');
    qaPath(origin.origin, e.scormSnapshotPath);
  }
  requireQa(new Set(enrollmentIds).size === 6, 'DEDICATED_PER_BROWSER_ENROLLMENTS');
  return {profile:data,fixture:data.projects[projectName]};
}
