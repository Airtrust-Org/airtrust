import puppeteer, { type Browser, type BrowserWorker, type HTTPRequest } from '@cloudflare/puppeteer';

import type { ScormRuntimeConformance } from './lms-scorm-quality-gate';
import { buildScormFunctionalDriverScript } from './lms-scorm-functional-driver';

const RUNNER_VERSION = 'AIRTRUST_SCORM_BROWSER_RUN_V1';
const TIMEOUT_MS = 30_000;
const CANDIDATE_ORIGIN = 'https://scorm-candidate.invalid/';

type CandidateAsset = { path: string; data: Uint8Array };
type TraceItem = { method: string; key?: string; value?: string };
type ObservedTrace = { trace: TraceItem[]; values: Record<string, string>; initialized: boolean; finished: boolean; lastError: string };

function escapeScript(value: string) {
  return value.replace(/<\/script/gi, '<\\/script');
}

function instrumentation() {
  return `<script>(function(){
var trace=[], values={}, finished=false, initialized=false, lastError='0';
function add(method,key,value){ trace.push({method:method,key:key,value:value}); }
function fail(code){lastError=code; return 'false';}
window.API=Object.freeze({
 LMSInitialize:function(){add('LMSInitialize'); if(initialized||finished)return fail('101'); initialized=true; return 'true';},
 LMSGetValue:function(key){add('LMSGetValue',String(key)); return values[String(key)]||'';},
 LMSSetValue:function(key,value){add('LMSSetValue',String(key),String(value)); if(!initialized||finished)return fail('301'); values[String(key)]=String(value); return 'true';},
 LMSCommit:function(){add('LMSCommit'); if(!initialized||finished)return fail('301'); return 'true';},
 LMSFinish:function(){add('LMSFinish'); if(!initialized||finished)return fail('301'); finished=true; return 'true';},
 LMSGetLastError:function(){add('LMSGetLastError'); return lastError;},
 LMSGetErrorString:function(code){add('LMSGetErrorString',String(code)); return String(code)==='0'?'No error':'SCORM error';},
 LMSGetDiagnostic:function(code){add('LMSGetDiagnostic',String(code)); return String(code||lastError);}
});
Object.defineProperty(window,'__AIRTRUST_SCORM_TRACE',{value:function(){return {trace:trace,values:values,initialized:initialized,finished:finished,lastError:lastError};},configurable:false});
})();</script>`;
}

function injectBeforePackageScripts(launchHtml: string) {
  const tag = instrumentation();
  if (/<head\b[^>]*>/i.test(launchHtml)) return launchHtml.replace(/<head\b[^>]*>/i, (head) => `${head}${tag}`);
  return `${tag}${launchHtml}`;
}

function analyzeTrace(candidateSha256: string, startedAt: string, trace: TraceItem[], values: Record<string, string>, initialized: boolean, finished: boolean, lastError: string): ScormRuntimeConformance {
  const hasCommit = trace.some((item) => item.method === 'LMSCommit');
  const callsAfterFinish = trace.findIndex((item) => item.method === 'LMSFinish') >= 0 && trace.slice(trace.findIndex((item) => item.method === 'LMSFinish') + 1).some((item) => ['LMSSetValue', 'LMSCommit', 'LMSFinish'].includes(item.method));
  const errors: string[] = [];
  if (!initialized) errors.push('LMSInitialize não observado');
  if (!hasCommit) errors.push('LMSCommit não observado');
  // Trace is captured after the runner dispatches a controlled session
  // termination (beforeunload/pagehide/unload) — the package had a real
  // opportunity to call LMSFinish from its own unload handler before this
  // is evaluated. A still-missing LMSFinish at this point means the
  // package's session was genuinely never terminated per the SCORM 1.2
  // communication protocol; it is not evidence of incomplete coursework
  // (lesson_status/completionReached are tracked and reported separately).
  if (!finished) errors.push('SCORM_SESSION_NOT_TERMINATED: LMSFinish não observado mesmo após encerramento controlado da sessão (beforeunload/pagehide/unload)');
  if (callsAfterFinish) errors.push('Chamada SCORM após LMSFinish');
  if (lastError !== '0') errors.push(`API SCORM retornou erro ${lastError}`);
  const lessonStatus = values['cmi.core.lesson_status'] ?? null;
  return {
    status: errors.length ? 'FAIL' : 'PASS', candidateSha256, startedAt, finishedAt: new Date().toISOString(),
    initializeObserved: initialized, commitObserved: hasCommit, finishObserved: finished,
    completionReached: lessonStatus === 'completed' || lessonStatus === 'passed', lessonStatus,
    scoreRaw: values['cmi.core.score.raw'] ?? null, masteryScore: values['cmi.student_data.mastery_score'] ?? null,
    lessonLocation: values['cmi.core.lesson_location'] ?? null,
    // Runtime trace can include answers, individual responses or learner IDs
    // embedded in suspend_data/interactions. Never persist the raw values in
    // candidate validation_results_json or QA artifacts.
    trace: trace.map((item) => ({
      method: item.method,
      ...(item.key === undefined ? {} : { key: String(item.key).slice(0, 120) }),
      ...(item.value === undefined ? {} : { value: '[redacted]' }),
    })),
    errors, runnerVersion: RUNNER_VERSION,
  };
}

/** Sanitized failure category for QA and audit summaries: never expose browser exception text. */
export function classifyScormBrowserError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/\b(?:429|quota|rate.limit|too many requests)\b/i.test(message)) return 'BROWSER_QUOTA';
  if (/\b(?:403|401|forbidden|access.denied|unauthorized)\b/i.test(message)) return 'BROWSER_ACCESS';
  if (/\b(?:502|503|504|service unavailable|browser service)\b/i.test(message)) return 'BROWSER_SERVICE';
  if (/timeout|timed out|deadline/i.test(message)) return 'BROWSER_TIMEOUT';
  if (/connection|disconnected|network|socket|websocket/i.test(message)) return 'BROWSER_CONNECTION';
  return 'BROWSER_OTHER';
}

/** Stable diagnostic for infrastructure failures, never raw exception messages. */
export function scormBrowserFailureCode(error: unknown): string {
  const typed = error && typeof error === 'object' ? error as { name?: unknown; code?: unknown } : null;
  const code = typed?.code;
  if (typeof code === 'string') {
    const allowed = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
      'ERR_CONNECTION_CLOSED', 'ERR_HTTP2_STREAM_ERROR']);
    if (allowed.has(code)) return code;
  }
  const name = typed?.name;
  if (name === 'TypeError') return 'TYPE_ERROR';
  if (name === 'TimeoutError') return 'TIMEOUT_ERROR';
  if (name === 'AbortError') return 'ABORT_ERROR';
  if (name === 'ProtocolError') return 'PROTOCOL_ERROR';
  if (name === 'Error') return 'GENERIC_ERROR';
  return 'UNKNOWN_ERROR';
}

/**
 * Conservative certification policy for the Browser Rendering trace.
 * External exams are backend-scored and must NEVER be inferred absent from
 * an empty SCORM interaction list (which only describes in-package exercises).
 */
export function requiresScormAssessmentEvidence(contract: unknown): boolean {
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return true;
  const assessment = (contract as { assessment?: unknown }).assessment;
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) return true;
  const declared = assessment as { mode?: unknown; requiredInteractions?: unknown };
  if (declared.mode === 'EXTERNAL') return true;
  return Array.isArray(declared.requiredInteractions)
    ? declared.requiredInteractions.length > 0 : true;
}

export async function runScormBrowserConformance(params: {
  browserBinding: unknown; candidateSha256: string; launchFile: string; assets: CandidateAsset[];
  /** Injectable ONLY for focused infrastructure-failure tests; default is real Cloudflare Browser Rendering. */
  launchBrowser?: (binding: BrowserWorker) => Promise<Browser>;
}): Promise<ScormRuntimeConformance> {
  const startedAt = new Date().toISOString();
  if (!params.browserBinding) return { status: 'ERROR', candidateSha256: params.candidateSha256, startedAt, finishedAt: new Date().toISOString(), initializeObserved: false, commitObserved: false, finishObserved: false, completionReached: false, lessonStatus: null, scoreRaw: null, masteryScore: null, lessonLocation: null, trace: [], errors: ['SCORM_BROWSER não configurado'], failureStage: 'BINDING_MISSING', failureCategory: 'BROWSER_ACCESS', runnerVersion: RUNNER_VERSION };
  const assets = new Map(params.assets.map((asset) => [asset.path, asset.data]));
  const launch = assets.get(params.launchFile);
  if (!launch) throw new Error('Launch file do candidato não encontrado');
  let browser: Browser | undefined;
  let failureStage = 'BROWSER_LAUNCH';
  try {
    const browserLauncher = params.launchBrowser ?? ((binding: BrowserWorker) => puppeteer.launch(binding));
    try {
      browser = await browserLauncher(params.browserBinding as BrowserWorker);
    } catch (firstError) {
      const category = classifyScormBrowserError(firstError);
      // One bounded retry exclusively during browser startup; access/quota
      // failures remain fail-closed. Never retry SCORM writes or an active session.
      if (category === 'BROWSER_QUOTA' || category === 'BROWSER_ACCESS') throw firstError;
      await new Promise(resolve => setTimeout(resolve, 350));
      browser = await browserLauncher(params.browserBinding as BrowserWorker);
    }
    failureStage = 'CREATE_PAGE';
    const page = await browser.newPage();
    failureStage = 'SET_REQUEST_INTERCEPTION';
    await page.setRequestInterception(true);
    page.on('request', async (request: HTTPRequest) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(CANDIDATE_ORIGIN).origin) return request.abort('blockedbyclient');
      const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const asset = assets.get(path);
      if (!asset) return request.respond({ status: 404, body: 'not found' });
      return request.respond({ status: 200, body: asset, headers: { 'Content-Type': path.endsWith('.js') ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
    });
    failureStage = 'LOAD_SCO_ASSETS';
    // networkidle0 waits for all incidental resources, not for SCO readiness.
    // It can timeout on an otherwise healthy course (fonts/images/telemetry).
    // DOMContentLoaded awaits parser-blocking course scripts; the next bounded
    // check independently proves that the SCORM adapter initialized.
    await page.setContent(`<base href="${CANDIDATE_ORIGIN}">${injectBeforePackageScripts(new TextDecoder().decode(launch))}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    failureStage = 'VERIFY_SCORM_INITIALIZATION';
    await page.waitForFunction(
      () => typeof (globalThis as unknown as { __AIRTRUST_SCORM_TRACE?: () => { initialized: boolean } }).__AIRTRUST_SCORM_TRACE === 'function' &&
        (globalThis as unknown as { __AIRTRUST_SCORM_TRACE: () => { initialized: boolean } }).__AIRTRUST_SCORM_TRACE().initialized === true,
      { timeout: TIMEOUT_MS },
    );
    // Drive authored M8 interactions by actually clicking course controls,
    // never by calling SCORMSetValue or forcing internal course state.
    failureStage = 'DRIVE_SCO_INTERACTIONS';
    const functional = await page.evaluate(buildScormFunctionalDriverScript()) as {
      supported: boolean; completed: boolean; steps: number; reason: string | null;
    };
    // Phase A (implicit): the page load above already lets the package run
    // its normal startup — LMSInitialize/GetValue/SetValue/Commit. LMSFinish
    // is deliberately not required yet; SCORM 1.2 packages commonly gate it
    // behind an explicit close/exit action rather than initial load.
    //
    // Phase B: give the package's own unload lifecycle a real opportunity to
    // run before evaluating LMSFinish. These are dispatched as ordinary DOM
    // events (not a real navigation-triggered teardown), so the page stays
    // alive and __AIRTRUST_SCORM_TRACE can still be read afterward — but any
    // beforeunload/pagehide/unload listener the package registered runs its
    // real code, synchronously, exactly as it would on an actual tab close.
    // The harness never calls window.API.LMSFinish itself; only the
    // package's own handler can do that.
    failureStage = 'CLOSE_SCO_SESSION';
    await page.evaluate(
      "window.dispatchEvent(new Event('beforeunload'));" +
        "window.dispatchEvent(new Event('pagehide'));" +
        "window.dispatchEvent(new Event('unload'));",
    );
    failureStage = 'READ_SCORM_TRACE';
    const observed = await page.evaluate('window.__AIRTRUST_SCORM_TRACE()') as ObservedTrace;
    const runtime = analyzeTrace(params.candidateSha256, startedAt, observed.trace, observed.values, observed.initialized, observed.finished, observed.lastError);
    const contractBytes = assets.get('airtrust-completion-manifest.json');
    let masteryScore: number | null = null;
    let expectedSuccessStatus: string | null = null;
    let requiresAssessmentEvidence = true;
    if (contractBytes) {
      try {
        const contract = JSON.parse(new TextDecoder().decode(contractBytes)) as {
          assessment?: { masteryScore?: unknown; requiredInteractions?: unknown; successStatus?: unknown };
        };
        const declared = contract?.assessment?.masteryScore;
        expectedSuccessStatus = typeof contract?.assessment?.successStatus === 'string'
          ? contract.assessment.successStatus : null;
        // Empty requiredInteractions is not proof that a separate Worker
        // exam is absent: assessment.mode=EXTERNAL must stay fail-closed.
        requiresAssessmentEvidence = requiresScormAssessmentEvidence(contract);
        if (typeof declared === 'number' && Number.isFinite(declared) &&
            declared >= 0 && declared <= 100) masteryScore = declared;
      } catch {
        // The static quality gate rejects malformed authoring contracts.
      }
    }
    return {
      ...runtime,
      masteryScore: masteryScore === null ? runtime.masteryScore : String(masteryScore),
      functionalCompletionVerified: functional.supported && functional.completed && functional.steps > 0,
      functionalCompletionReason: functional.reason,
      expectedSuccessStatus,
      requiresAssessmentEvidence,
    };
  } catch (error) {
    const timedOut = error instanceof Error && /timeout/i.test(error.message);
    const failureCategory = classifyScormBrowserError(error);
    const failureCode = scormBrowserFailureCode(error);
    // This result is persisted in candidate validation JSON and may reach QA
    // artifacts. NEVER record arbitrary browser exception text: some runtimes
    // include internal addresses, request headers or authentication fragments.
    return { status: timedOut ? 'TIMEOUT' : 'ERROR', candidateSha256: params.candidateSha256, startedAt, finishedAt: new Date().toISOString(), initializeObserved: false, commitObserved: false, finishObserved: false, completionReached: false, lessonStatus: null, scoreRaw: null, masteryScore: null, lessonLocation: null, trace: [], errors: ['SCORM_BROWSER_INFRASTRUCTURE_ERROR'], failureStage, failureCategory, failureCode, runnerVersion: RUNNER_VERSION };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

export { analyzeTrace };
